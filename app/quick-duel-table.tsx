// Quick Duel on the canonical engine. The engine owns every rule; this component renders its
// state with the Paper-Fu mat, offers the human seat its legal actions and choices, and lets the
// computer seat play through EngineSession. No rules live here.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { artistUrl, fighterIllustrationUrl, locationTheme, presentationSlug } from "./card-art";
import { cardMotionDisabled } from "./card-motion";
import { SceneReveal } from "./scene-reveal";
import { useCardMotion } from "./use-card-motion";
import type { EngineCard } from "./clash-engine.ts";
import { EngineSession, newSeed, type EngineAction, type EngineGame, type EnginePending, type EngineSeat, type SavedSession } from "./engine-session.ts";
import { choicePrompt, choiceTitle, fightLog, findInstance, incomingAttack, latestExchange, matPhase, reasonLabel, seatStats, statusLabels, type Exchange, type MatPhase } from "./mat-view.ts";
import cardPlaceholderUrl from "./assets/art/card-placeholder-v2.webp";

const CardInspector = lazy(() => import("./card-inspector").then((module) => ({ default: module.CardInspector })));

type MatCard = EngineCard & { timing?: string | null; flavorText?: string | null; details?: Record<string, string | number> };
type VfxKind = "attack" | "hit" | "block" | "ko" | "certified" | "promotion";
type Vfx = { id: number; human?: VfxKind; computer?: VfxKind; screen?: "impact" | "scene"; cue: string; cueScale?: number; tone: "attack" | "damage" | "block" | "certified" | "promotion" | "summary"; announcement: string; promotion?: { side: "human" | "computer"; belt: string; previous: string } };
type DeskView = "market" | "combo" | "belt";

type TableProps = {
  session: EngineSession;
  sessionKey: number;
  agentName: string;
  guided: boolean;
  motion: "full" | "reduced" | "off";
  onSave: (session: EngineSession) => void;
  onExit: () => void;
  onRematch: () => void;
};

export const ENGINE_DUEL_STORAGE_KEY = "ddb-engine-duel";
export type QuickDuelStart = { fighterId: string; opponentId: string } | "resume";
export type QuickDuelMatProps = Omit<TableProps, "session" | "sessionKey" | "onSave"> & { start: QuickDuelStart; startKey: number; rulesVersion: string };

function readSaved(): SavedSession | null {
  try { return JSON.parse(window.localStorage.getItem(ENGINE_DUEL_STORAGE_KEY) ?? "null") as SavedSession | null; } catch { return null; }
}

/** Starts (or resumes) a Quick Duel session and keeps its save up to date. */
export default function QuickDuelMat({ start, startKey, rulesVersion, onExit, ...props }: QuickDuelMatProps) {
  const [session] = useState<EngineSession | null>(() => {
    if (start === "resume") {
      const saved = readSaved();
      return saved && saved.setup.rulesVersion === rulesVersion ? EngineSession.restore(saved) : null;
    }
    return new EngineSession({ mode: "quick-duel", seed: newSeed(), fighters: [start.fighterId, start.opponentId], humanSeats: [HUMAN], rulesVersion });
  });
  useEffect(() => {
    if (!session) { window.localStorage.removeItem(ENGINE_DUEL_STORAGE_KEY); onExit(); }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!session) return null;
  const save = (current: EngineSession) => {
    try {
      if (current.over) window.localStorage.removeItem(ENGINE_DUEL_STORAGE_KEY);
      else window.localStorage.setItem(ENGINE_DUEL_STORAGE_KEY, JSON.stringify(current.save()));
    } catch { /* storage full or blocked: the duel continues unsaved */ }
  };
  return <QuickDuelTable {...props} session={session} sessionKey={startKey} onSave={save} onExit={() => { window.localStorage.removeItem(ENGINE_DUEL_STORAGE_KEY); onExit(); }} />;
}

const HUMAN = 0;
const COMPUTER = 1;
const IMPACT_WORDS = [
  { min: 7, scale: 1.55, words: ["HIYAH!!", "KA-BLAM!", "OVERTIME!"] },
  { min: 5, scale: 1.32, words: ["WHAM!", "KRAK!", "STAMPED!"] },
  { min: 3, scale: 1.14, words: ["POW!", "THWAP!", "FILED!"] },
  { min: 1, scale: 1, words: ["BONK!", "BOP!", "TAP!"] },
];
const PHASE_WORD: Record<MatPhase, string> = { "player-initiate": "INITIATE", "player-yell": "YELL", "player-ascend": "ASCEND", "defense-window": "REACTION", "reversal-window": "REVERSAL", "ai-ready": "OPPONENT" };
const HAND_PRIORITY = ["play-attack", "play-card", "practice", "bad-habit-focus"];
const num = (value: unknown) => Number.parseInt(String(value ?? 0), 10) || 0;
const isAttackCard = (card: EngineCard) => num(card.stats?.["Attack Power"]) > 0;
const isDefenseCard = (card: EngineCard) => num(card.stats?.Guard) > 0 && (card.subtype === "Defense" || (card as MatCard).details?.Type === "Defense");

function QuickDuelTable({ session, sessionKey, agentName, guided, motion, onSave, onExit, onRematch }: TableProps) {
  const game = session.game;
  if (import.meta.env.DEV) (window as unknown as { __ddbSession?: EngineSession }).__ddbSession = session;
  const [tick, setTick] = useState(0);
  const rerender = () => setTick((value) => value + 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deskView, setDeskView] = useState<DeskView | null>(null);
  const [inspected, setInspected] = useState<MatCard | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [vfx, setVfx] = useState<Vfx | null>(null);
  const [sceneReveal, setSceneReveal] = useState<{ key: number; card: MatCard; previous: string | null; opening: boolean } | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const vfxSerial = useRef(0);
  const seenEvents = useRef(game.events.length);
  const seenLocation = useRef<string | null>(null);
  const reducedMotion = cardMotionDisabled(motion);

  const human = game.players[HUMAN];
  const computer = game.players[COMPUTER];
  const belts = game.definition.progression.belts;
  const over = game.winner !== null;
  const phase = matPhase(game, HUMAN);
  const pending = game.pendingChoice?.playerId === HUMAN ? game.pendingChoice : null;
  const handChoice = pending && ["defense", "reaction", "reversal"].includes(pending.kind) ? pending : null;
  const dialogChoice = pending && !handChoice ? pending : null;
  const legal = session.legalFor(HUMAN);
  const pass = legal.find((action) => action.type === "pass");
  const selected = selectedId ? human.hand.find((card) => card.instanceId === selectedId) ?? null : null;
  const selectedAttack = selected ? legal.find((action) => action.type === "play-attack" && action.cardId === selected.instanceId) ?? null : null;
  const exchange = useMemo(() => latestExchange(game), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const log = useMemo(() => fightLog(game, HUMAN), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const incoming = incomingAttack(game, HUMAN);

  const afterMove = () => { onSave(session); rerender(); };
  const act = (action: EngineAction) => { if (session.act(action)) { setSelectedId(null); afterMove(); } };
  const choose = (optionId: string) => { if (session.choose(optionId)) afterMove(); };

  // The computer seat (and automatic Honor) moves one visible beat at a time.
  useEffect(() => {
    if (over || session.humanToAct()) return;
    const timer = window.setTimeout(() => { session.stepBots(); afterMove(); }, reducedMotion ? 150 : 650);
    return () => window.clearTimeout(timer);
  }, [tick, over]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide has exactly one legal action; take it for the player.
  useEffect(() => {
    const hide = legal.find((action) => action.type === "hide");
    if (hide && !pending) act(hide);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Ascend desk opens on its own when the player's Ascend begins.
  useEffect(() => {
    if (phase === "player-ascend" && game.phase === "Ascend") setDeskView((current) => current ?? "market");
    if (phase !== "player-ascend") setDeskView(null);
  }, [phase, game.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combat, promotion and scene-change effects, read from the engine's event log.
  useEffect(() => {
    const fresh = game.events.slice(seenEvents.current);
    seenEvents.current = game.events.length;
    const next = vfxFor(fresh, game, belts);
    if (!next) return;
    const id = ++vfxSerial.current;
    setVfx({ id, ...next });
    const timer = window.setTimeout(() => setVfx((current) => current?.id === id ? null : current), next.promotion ? 1700 : 1100);
    return () => window.clearTimeout(timer);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The opening Location and every scene change take the stage once.
  useEffect(() => {
    const location = game.currentLocation as MatCard | null;
    if (!location || over || seenLocation.current === location.catalogId) return;
    const previous = seenLocation.current;
    seenLocation.current = location.catalogId;
    setSceneReveal({ key: Date.now(), card: location, previous: previous ? findName(game, previous) : null, opening: previous === null });
  }, [tick, over]); // eslint-disable-line react-hooks/exhaustive-deps

  useCardMotion(shellRef, { deck: ids(human.deck), hand: ids(human.hand), discard: ids(human.discard), playArea: ids(human.played), market: ids(game.market) }, motion, sessionKey);

  const useHandCard = (card: EngineCard) => {
    if (handChoice) { if (handChoice.options.some((option) => option.id === card.instanceId)) choose(card.instanceId!); return; }
    const action = primaryAction(legal, card);
    if (!action) return;
    if (action.type === "play-attack") setSelectedId((current) => current === card.instanceId ? null : card.instanceId!);
    else act(action);
  };
  const handCardEnabled = (card: EngineCard) => handChoice ? handChoice.options.some((option) => option.id === card.instanceId) : !dialogChoice && Boolean(primaryAction(legal, card));
  const equipmentActions = legal.filter((action) => action.type === "activate-equipment");
  const currentLocation = game.currentLocation as MatCard | null;
  const stats = seatStats(game, human);
  const coach = coachLine(game, phase, legal, selected, handChoice);

  const dock = !over && <nav className={`playtest-action-dock dock-${phase}`} aria-label="Next legal action">
    <div><span>{PHASE_WORD[phase]}</span><b>{dockLabel(game, phase, selected, handChoice)}</b></div>
    {phase === "player-initiate" && pass && <button onClick={() => act(pass)}>Proceed to Yell →</button>}
    {phase === "player-yell" && <div className="dock-action-group">{selectedAttack && <button onClick={() => act(selectedAttack)}>Declare Attack →</button>}{pass && <button className={selectedAttack ? "dock-secondary" : ""} onClick={() => act(pass)}>{selectedAttack ? "Skip · Ascend" : "Proceed to Ascend →"}</button>}</div>}
    {phase === "player-ascend" && <div className="dock-action-group"><button className="dock-secondary" onClick={() => setDeskView(deskView ?? "market")}>Open Ascend desk</button>{pass && <button onClick={() => act(pass)}>Finish turn → Hide</button>}</div>}
    {handChoice && <button onClick={() => choose("pass")}>{handChoice.kind === "defense" ? "Take the hit" : handChoice.kind === "reversal" ? "Decline Reversal" : "No Reaction"}</button>}
  </nav>;

  return <main ref={shellRef} className={`playtest-shell playtest-shell--live playtest-shell--engine mat-v3 location-${locationTheme(currentLocation)} motion-${motion}${guided ? " playtest-shell--guided" : ""}${over ? " playtest-shell--finished" : ""}${vfx?.screen === "impact" ? ` ddb-vfx-screen-impact ddb-vfx-screen-v${vfx.id % 5}` : ""}${vfx?.screen === "scene" ? " ddb-vfx-scene" : ""} shell`}>
    {sceneReveal && !over && <SceneReveal key={sceneReveal.key} card={sceneReveal.card} art={artistUrl(sceneReveal.card)} previousName={sceneReveal.previous} round={game.round} opening={sceneReveal.opening} targetSelector=".playtest-shell--live .combat-stage-heading > button" reducedMotion={reducedMotion} onDone={() => setSceneReveal(null)} />}
    {vfx && <><div className="playtest-vfx-layer" aria-hidden="true"><div className={`playtest-vfx-cue playtest-vfx-cue--combat playtest-vfx-cue--${vfx.tone}`} style={{ "--cue-scale": vfx.cueScale ?? 1 } as CSSProperties} key={vfx.id}><strong>{vfx.cue}</strong><small>{vfx.announcement}</small></div>{vfx.promotion && <div className={`playtest-belt-promotion playtest-belt-promotion--${vfx.promotion.side === "human" ? "player" : "ai"}`} key={`promotion-${vfx.id}`}><span>{vfx.promotion.side === "human" ? "CERTIFICATION APPROVED" : "OPPONENT FILING"}</span><strong>{vfx.promotion.belt} BELT</strong><small>{vfx.promotion.previous} → {vfx.promotion.belt}</small></div>}</div><div className="playtest-vfx-announcer" role="status" aria-live="polite">{vfx.announcement}</div></>}

    <header className="playtest-topbar battle-versus-hud">
      <HudFighter seat={human} side="player" title={agentName} />
      <div className="versus-center" aria-label={`Round ${game.round}`}><span>ROUND</span><b>{game.round}</b></div>
      <HudFighter seat={computer} side="ai" title="COMPUTER" />
    </header>

    {over && <ResultCertificate game={game} onRematch={onRematch} onExit={onExit} />}

    <section className="playtest-arena">
      <div className="mat-stage" aria-hidden="true">{currentLocation && artistUrl(currentLocation) && <img src={artistUrl(currentLocation)} alt="" decoding="async" />}<span className="mat-stage-burst" /><span className="mat-stage-curtain mat-stage-curtain--left" /><span className="mat-stage-curtain mat-stage-curtain--right" /><span className="mat-stage-floor" /></div>
      <section className="playtest-table">
        <div className="fighter-column fighter-column--player"><SeatPanel game={game} seat={human} label="You" vfx={vfx?.human} vfxVariant={vfx ? vfx.id % 5 : undefined} onInspect={setInspected} onOpenCombo={() => setDeskView("combo")} /></div>
        <div className="combat-stage-column">
          <CombatStage game={game} phase={phase} location={currentLocation} selected={selected} incoming={incoming} exchange={exchange} log={log} coach={guided ? coach : null} onInspect={setInspected} onDropCard={(instanceId) => { const card = human.hand.find((entry) => entry.instanceId === instanceId); if (card) useHandCard(card); }} />
          {phase === "ai-ready" && !over && <span className="ai-thinking"><i /><i /><i /> {game.pendingChoice ? "Computer is deciding" : "Clipboard thinking"}</span>}
        </div>
        <div className="fighter-column fighter-column--enemy"><SeatPanel game={game} seat={computer} label="Computer" enemy vfx={vfx?.computer} vfxVariant={vfx ? vfx.id % 5 : undefined} onInspect={setInspected} /></div>
      </section>
    </section>

    <section className="playtest-workspace playtest-workspace--hand">
      <section className={`hand-panel paper-stack${phase === "player-initiate" && !human.hand.some(handCardEnabled) ? " hand-panel--idle" : ""}`}>
        <header><div><span className="eyebrow">Your hand · {human.hand.length} cards</span><h2>{handHeading(game, phase, handChoice, human)}</h2></div>
          <div className="hand-counters"><span>Deck {human.deck.length}</span><span>Discard {human.discard.length}</span><span>Attacks {human.attackCount ?? 0}</span><span>Practice {human.practiceUsed ? "used" : "ready"}</span><span>Focus {human.focus}</span><span>ATK {stats.atk} · DEF {stats.def} · SPD {stats.speed}</span></div></header>
        {equipmentActions.length > 0 && <div className="equipment-reaction-strip equipment-trigger-strip" aria-label="Available Equipment actions"><span>Equipment actions</span>{equipmentActions.map((action) => { const item = findInstance(game, action.cardId!); return <button type="button" onClick={() => act(action)} key={action.cardId}><b>Exhaust {item?.name ?? "Equipment"}</b><small>{item?.rulesText?.slice(0, 64) ?? "Activate"}</small></button>; })}</div>}
        <div className="play-card-row">{human.hand.map((card, index) => <PlayCard key={card.instanceId} card={card} handIndex={index} handTotal={human.hand.length} selected={selectedId === card.instanceId} disabled={!handCardEnabled(card)} hint={handChoice ? undefined : actionHint(primaryAction(legal, card))} onClick={() => useHandCard(card)} onInspect={() => setInspected(card)} />)}</div>
      </section>
    </section>
    {dock}

    <footer className="playtest-utility-dock" aria-label="Quick Duel utilities">
      <div className="playtest-utility-group"><button type="button" onClick={() => setLogOpen(true)}>Fight log</button><button type="button" onClick={() => setDeskView("market")}>Market</button><button type="button" onClick={() => setDeskView("belt")}>Belt ledger</button></div>
      <div className="playtest-utility-group playtest-utility-group--nav"><span className="rules-sync rules-sync--current">Rules {game.definition.rulesVersion} · engine</span><button type="button" onClick={onExit}>Leave the mat</button></div>
    </footer>

    {deskView && <AscendDesk game={game} view={deskView} legal={legal} onView={setDeskView} onAct={act} onInspect={setInspected} onClose={() => setDeskView(null)} onFinish={pass && phase === "player-ascend" ? () => act(pass) : null} />}
    {dialogChoice && <ChoiceDialog game={game} pending={dialogChoice} onChoose={choose} />}
    {logOpen && <div className="playtest-inspector-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setLogOpen(false)}><section className="fight-log-dialog paper-stack" role="dialog" aria-modal="true" aria-labelledby="fight-log-title"><button className="modal-close" onClick={() => setLogOpen(false)} aria-label="Close fight log">×</button><span className="eyebrow">Department receipt</span><h2 id="fight-log-title">Fight log</h2><ol>{log.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ol></section></div>}
    {inspected && <Suspense fallback={null}><CardInspector card={inspected as never} imageUrl={artistUrl(inspected) ?? cardPlaceholderUrl} saved={false} positionLabel="Quick Duel card" onToggleSaved={() => undefined} onClose={() => setInspected(null)} /></Suspense>}
  </main>;
}

function HudFighter({ seat, side, title }: { seat: EngineSeat; side: "player" | "ai"; title: string }) {
  const percent = Math.max(0, Math.min(100, seat.hp / Math.max(1, seat.maxHp) * 100));
  return <div className={`battle-hud-fighter battle-hud-fighter--${side} hp-tier-${healthTier(seat.hp, seat.maxHp)}`} style={{ "--hp-progress": `${percent}%` } as CSSProperties}>
    <span><small>{side === "player" ? "YOU" : "COMPUTER"} · {seat.character.name}</small></span><b>{title}</b>
    <div><strong>{seat.hp}<small> HP</small></strong><i role="progressbar" aria-label={`${seat.character.name} health`} aria-valuemin={0} aria-valuemax={seat.maxHp} aria-valuenow={seat.hp}><em style={{ width: `${percent}%` }} /></i></div>
  </div>;
}

const ids = (cards: EngineCard[]) => cards.map((card) => card.id ?? card.catalogId);

function findName(game: EngineGame, catalogId: string) {
  return [game.currentLocation, ...game.market].find((card) => card?.catalogId === catalogId)?.name ?? null;
}

function primaryAction(legal: EngineAction[], card: EngineCard) {
  const actions = legal.filter((action) => action.cardId === card.instanceId);
  return HAND_PRIORITY.map((type) => actions.find((action) => action.type === type)).find(Boolean) ?? actions[0] ?? null;
}

function actionHint(action: EngineAction | null) {
  if (!action) return undefined;
  return ({ "play-attack": "Attack", "play-card": "Play", practice: "Practice", "bad-habit-focus": "+1 Focus" } as Record<string, string>)[action.type];
}

function healthTier(hp: number, maxHp: number) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  return ratio <= .34 ? "critical" : ratio <= .66 ? "warning" : "healthy";
}

function dockLabel(game: EngineGame, phase: MatPhase, selected: EngineCard | null, handChoice: EnginePending | null) {
  if (handChoice) return handChoice.kind === "defense" ? `Defend ${handChoice.zone ?? ""} or take it` : handChoice.kind === "reversal" ? "Counter or decline" : "React or pass";
  if (phase === "player-initiate") return "Equipment first";
  if (phase === "player-yell") return selected ? `${selected.name} selected` : `${game.players[HUMAN].attackCount ?? 0} attack${game.players[HUMAN].attackCount === 1 ? "" : "s"} played`;
  if (phase === "player-ascend") return `${game.players[HUMAN].focus} Focus to spend`;
  return "Opponent's turn";
}

function handHeading(game: EngineGame, phase: MatPhase, handChoice: EnginePending | null, human: EngineSeat) {
  if (handChoice?.kind === "defense") return `Defend ${handChoice.zone ?? "the strike"} or let it land`;
  if (handChoice?.kind === "reaction") return "Play a Reaction or pass";
  if (handChoice?.kind === "reversal") return "Return the favor immediately";
  if (game.pendingChoice) return "Waiting on a decision";
  if (phase === "player-initiate") return human.hand.some((card) => ["Weapon", "Gear", "Defense Equipment"].includes(card.subtype ?? "")) ? "Equip before the yelling starts" : "No Equipment in hand. Proceed to Yell.";
  if (phase === "player-yell") return "Choose your next card";
  if (phase === "player-ascend") return "Spend Focus at the Ascend desk";
  return "The opponent has initiative";
}

function coachLine(game: EngineGame, phase: MatPhase, legal: EngineAction[], selected: EngineCard | null, handChoice: EnginePending | null) {
  if (game.winner !== null) return "The field test is over. A rematch is one click away.";
  if (handChoice?.kind === "defense") return handChoice.options.length > 1 ? `A ${handChoice.zone} Attack is incoming. Glowing cards cover that zone; play one or take the hit.` : "No Defense in hand covers that zone. Base DEF still applies.";
  if (handChoice?.kind === "reversal") return "You blocked with a Defense. Choose an Attack for a counter, or decline.";
  if (phase === "player-initiate") return legal.some((action) => action.type === "play-card") ? "Equip any Equipment you want before Yell. Each Equip generates its printed Focus." : "Nothing to equip. Proceed to Yell.";
  if (phase === "player-yell") return selected ? `Declare ${selected.name}, or pick another card.` : legal.some((action) => action.type === "play-attack") ? "Pick an Attack, practice a Defense for Focus, or play a Kata or Consumable." : "No legal Attacks. Play support cards or proceed to Ascend.";
  if (phase === "player-ascend") return "Buy from the Market, decide the Combo offer, and promote if your Belt is ready. Then finish the turn.";
  return "The computer is taking its turn.";
}

function vfxFor(events: { type: string; [key: string]: unknown }[], game: EngineGame, belts: EngineGame["definition"]["progression"]["belts"]): Omit<Vfx, "id"> | null {
  const knockout = events.find((event) => event.type === "knockout");
  const attack = [...events].reverse().find((event) => event.type === "attack");
  const promotion = events.find((event) => event.type === "promotion");
  const side = (id: unknown): "human" | "computer" => id === HUMAN ? "human" : "computer";
  if (attack) {
    const damage = Number(attack.damage);
    const blocked = damage <= 0;
    const tier = IMPACT_WORDS.find((entry) => damage >= entry.min) ?? IMPACT_WORDS[IMPACT_WORDS.length - 1];
    const word = tier.words[game.events.length % tier.words.length];
    const attacker = side(attack.attacker); const defender = side(attack.defender);
    const kinds: Partial<Record<"human" | "computer", VfxKind>> = { [attacker]: "attack", [defender]: knockout ? "ko" : blocked ? "block" : "hit" };
    return {
      ...kinds, screen: blocked ? undefined : "impact", cue: knockout ? "K.O.!" : blocked ? "BLOCK!" : word, cueScale: knockout ? 1.7 : blocked ? 1.1 : tier.scale,
      tone: blocked ? "block" : "damage",
      announcement: knockout ? "The field test has reached a conclusive impact." : blocked ? "Defense filed. The hit has been redirected to the paperwork." : `${damage} damage certified.`,
    };
  }
  if (promotion) {
    const who = side(promotion.player);
    const previous = belts[Number(promotion.from)]?.name ?? "Previous";
    return { [who]: "promotion", screen: "scene", cue: who === "human" ? "BELT UP!" : "RANK SHIFT!", tone: "promotion", announcement: `${previous} to ${promotion.belt}. Certification approved.`, promotion: { side: who, belt: String(promotion.belt), previous } };
  }
  if (events.some((event) => event.type === "scene-change")) return { screen: "scene", cue: "SCENE CHANGE", tone: "summary", announcement: `Scene changed to ${game.currentLocation?.name ?? "the next location"}.` };
  return null;
}

function NativeCardArt({ card }: { card: MatCard }) {
  const glyph = isAttackCard(card) ? "✦" : isDefenseCard(card) ? "◆" : card.subtype === "Kata" ? "◎" : card.cardType === "Combo" ? "∞" : "✺";
  return <span className="native-card-art" aria-hidden="true"><span className="native-card-ribbon">{card.subtype || card.cardType}</span><b>{glyph}</b><strong>{card.name}</strong><small>{(card.rulesText ?? "No additional effect.").slice(0, 112)}</small><em>DDB · CERTIFIED COPY</em></span>;
}

function PlayCard({ card, selected, disabled, hint, onClick, onInspect, handIndex, handTotal, price }: { card: MatCard; selected?: boolean; disabled?: boolean; hint?: string; onClick?: () => void; onInspect: () => void; handIndex?: number; handTotal?: number; price?: string }) {
  const art = artistUrl(card);
  const kind = isAttackCard(card) ? "attack" : isDefenseCard(card) ? "defense" : card.subtype === "Kata" ? "kata" : card.cardType.toLocaleLowerCase();
  const canDrag = !disabled && Boolean(onClick);
  const beginDrag = (event: DragEvent<HTMLElement>) => {
    if (!canDrag || !card.instanceId) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-dojo-card", card.instanceId);
  };
  const handStyle = handIndex === undefined ? undefined : { "--hand-index": handIndex, "--hand-total": handTotal ?? 1, "--hand-angle": `${(handIndex - ((handTotal ?? 1) - 1) / 2) * 5}deg`, "--hand-arc": (handIndex - ((handTotal ?? 1) - 1) / 2) ** 2 } as CSSProperties;
  return <article className={`play-card play-card--${kind} ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`} style={handStyle} draggable={canDrag} onDragStart={beginDrag} data-card-id={card.id}>
    <button className="play-card-main" disabled={disabled || !onClick} onClick={onClick} aria-label={`${hint ?? "Use"} ${card.name}`}>
      <span className="play-card-art-window">{art ? <img src={art} alt="" loading="lazy" decoding="async" /> : <NativeCardArt card={card} />}</span>
      <span className="play-card-kind">{hint && !disabled ? hint : card.subtype || card.cardType}</span>
      <span className="play-card-fallback"><b>{card.name}</b><small>{(card.rulesText ?? "No additional effect.").slice(0, 88)}</small><em>{card.catalogId}</em></span>
      <span className="play-card-meta"><b>{price ?? card.fpCost ?? "—"}<small> COST</small></b><strong>{card.focusValue ?? "—"}<small> FOCUS</small></strong><em>{card.zone ?? "—"} · {card.timing ?? "—"}</em></span>
    </button>
    <button className="play-card-inspect" onClick={onInspect} aria-label={`Inspect ${card.name}`}>Inspect</button>
  </article>;
}

function StatGlyph({ stat }: { stat: "HP" | "FP" | "ATK" | "DEF" | "SPD" }) {
  const paths = {
    HP: <path d="M12 20s-7-4.4-9.2-8.3C.8 8.2 2.6 4.5 6.4 4.5c2.1 0 3.4 1.2 4.1 2.4.7-1.2 2-2.4 4.1-2.4 3.8 0 5.6 3.7 3.6 7.2C16 15.6 12 20 12 20Z" />,
    FP: <path d="M18.5 12a6.5 6.5 0 1 1-6.5-6.5c3 0 5 1.8 5 4.1 0 2-1.7 3.5-3.8 3.5-1.7 0-2.9-1-2.9-2.3 0-1.1.9-1.9 2.1-1.9" />,
    ATK: <path d="M6.3 11.2V7.1c0-1.6 2.2-1.7 2.2-.1V5.8c0-1.6 2.2-1.7 2.2-.1V5c0-1.6 2.2-1.6 2.2 0v.8c0-1.5 2.2-1.5 2.2.1v5l1-1.1c1.1-1.2 3 .2 2 1.6l-3.7 5.2V20H8.2v-3.2l-3-3.7c-1-1.3.2-3 1.1-1.9Z" />,
    DEF: <path d="M12 2.7 19 5v5.5c0 4.4-2.7 7.7-7 10.8-4.3-3.1-7-6.4-7-10.8V5l7-2.3Z" />,
    SPD: <path d="M13.5 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.4-7.5Z" />,
  };
  return <svg className={`fighter-stat-glyph stat-${stat.toLocaleLowerCase()}`} viewBox="0 0 24 24" aria-hidden="true">{paths[stat]}</svg>;
}

function SeatPanel({ game, seat, label, enemy, vfx, vfxVariant, onInspect, onOpenCombo }: { game: EngineGame; seat: EngineSeat; label: string; enemy?: boolean; vfx?: VfxKind; vfxVariant?: number; onInspect: (card: MatCard) => void; onOpenCombo?: () => void }) {
  const belts = game.definition.progression.belts;
  const fighter = seat.character as MatCard;
  const art = fighterIllustrationUrl(fighter) ?? artistUrl(fighter) ?? cardPlaceholderUrl;
  const belt = belts[seat.beltIndex];
  const nextBelt = belts[seat.beltIndex + 1];
  const xpProgress = nextBelt ? Math.max(0, Math.min(100, (seat.xp - belt.xp) / Math.max(1, nextBelt.xp - belt.xp) * 100)) : 100;
  const hpProgress = Math.max(0, Math.min(100, seat.hp / Math.max(1, seat.maxHp) * 100));
  const stats = seatStats(game, seat);
  const statuses = statusLabels(seat);
  return <section className={`fighter-panel fighter-dossier living-fighter-card paper-stack hp-tier-${healthTier(seat.hp, seat.maxHp)} ${enemy ? "is-enemy" : ""}${vfx ? ` ddb-vfx-${vfx} ddb-vfx-v${vfxVariant ?? 0}` : ""}`} data-side={enemy ? "ai" : "player"} data-fighter={presentationSlug(fighter.name)}>
    <i className="fighter-paperclip" aria-hidden="true" />
    <header className="fighter-card-heading"><div><span>{label}</span><button className="fighter-dossier-name" onClick={() => onInspect(fighter)}>{fighter.name}</button></div><b className="fighter-belt-badge" data-belt={presentationSlug(belt.name)}>{belt.name}<small>BELT</small></b></header>
    <div className="fighter-vitality" aria-label={`${fighter.name} has ${seat.hp} of ${seat.maxHp} HP`}>
      <div><StatGlyph stat="HP" /><b>{seat.hp}</b><span>/ {seat.maxHp} HP</span></div>
      <span className="fighter-hp-track" role="progressbar" aria-valuemin={0} aria-valuemax={seat.maxHp} aria-valuenow={seat.hp}><i style={{ width: `${hpProgress}%` }} /></span>
    </div>
    <button type="button" className="fighter-panel-art fighter-card-illustration" onClick={() => onInspect(fighter)} aria-label={`Inspect ${fighter.name}`}><span className="fighter-art-halo" aria-hidden="true" /><img src={art} alt={fighter.name} decoding="async" /><span>Inspect fighter</span></button>
    <div className="fighter-stats fighter-stats--combat" aria-label={`${fighter.name} combat statistics`}>
      {([["ATK", stats.atk], ["DEF", stats.def], ["SPD", stats.speed]] as const).map(([stat, value]) => <b key={stat}><StatGlyph stat={stat} /><small>{stat}</small><span>{value}</span></b>)}
    </div>
    <div className="fighter-resource-strip">
      <div className="fighter-xp-meter"><span><b>{seat.xp} XP</b><small>{nextBelt ? `${nextBelt.xp} for ${nextBelt.name}` : "Final certification"}</small></span><i role="progressbar" aria-label={`${fighter.name} Belt progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(xpProgress)}><em style={{ width: `${xpProgress}%` }} /></i></div>
      <b className="fighter-focus-seal"><StatGlyph stat="FP" /><span>{seat.focus}</span><small>FOCUS</small></b>
    </div>
    <div className="fighter-status-tray" aria-label={`${fighter.name} current statuses`}>{statuses.length ? statuses.map((status) => <span key={status}>{status}</span>) : <span>Standing ready</span>}</div>
    <p className="fighter-ability"><b>Registered ability</b><span>{fighter.rulesText ?? "No additional ability."}</span></p>
    <section className={`fighter-equipment-tabs is-open ${enemy ? "is-enemy" : ""}`} aria-label={`${enemy ? "Opponent" : "Your"} attached Equipment`}>
      <div>{seat.equipment.map((item) => { const exhausted = seat.exhaustedEquipment.includes(item.instanceId ?? ""); return <button type="button" className={`fighter-equipment-tab ${exhausted ? "is-exhausted" : "is-ready"}`} onClick={() => onInspect(item)} title={`${item.name} · ${exhausted ? "Exhausted" : "Ready"}`} key={item.instanceId}><span>{(item.subtype ?? "E").slice(0, 1)}</span><b>{item.name}</b><small>{exhausted ? "EXHAUSTED" : "READY"}</small></button>; })}</div>
    </section>
    {onOpenCombo && <button type="button" className="fighter-combo-launch" onClick={onOpenCombo} aria-label={`Open Combo docket, ${seat.learnedCombos.length} of 2 learned`}><span>∞ COMBOS</span><b>{seat.learnedCombos.length}/2</b><small>Open docket</small></button>}
  </section>;
}

function StageSlot({ card, side, label, onInspect }: { card: MatCard | null; side: "player" | "ai"; label: string; onInspect: (card: MatCard) => void }) {
  return <div className={`clash-card-slot clash-card-slot--${side} ${card ? "is-occupied" : ""}`}>
    <span>{label}</span>
    {card ? <button type="button" onClick={() => onInspect(card)} aria-label={`Inspect ${card.name}`} key={card.instanceId ?? card.id}>
      <span className="clash-card-art">{artistUrl(card) ? <img src={artistUrl(card)} alt="" /> : <NativeCardArt card={card} />}</span>
      <span className="clash-card-copy"><b>{card.name}</b><small>{card.subtype || card.cardType}{card.zone ? ` · ${card.zone}` : ""}</small></span>
    </button> : <div className="clash-card-empty"><i aria-hidden="true" /><small>Waiting</small></div>}
  </div>;
}

function CombatStage({ game, phase, location, selected, incoming, exchange, log, coach, onInspect, onDropCard }: { game: EngineGame; phase: MatPhase; location: MatCard | null; selected: EngineCard | null; incoming: EngineCard | null; exchange: Exchange | null; log: string[]; coach: string | null; onInspect: (card: MatCard) => void; onDropCard: (instanceId: string) => void }) {
  const humanCard = selected ?? (incoming ? null : exchange ? (exchange.attacker === HUMAN ? exchange.attackCard : exchange.defenseCard) : null);
  const computerCard = incoming ?? (exchange ? (exchange.attacker === COMPUTER ? exchange.attackCard : exchange.defenseCard) : null);
  const hotZone = game.pendingChoice?.zone ?? (selected ? selected.zone : exchange?.zone ?? exchange?.attackCard?.zone) ?? null;
  const settled = !incoming && !selected && exchange;
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-dojo-card"); if (id) onDropCard(id); };
  const human = game.players[HUMAN]; const computer = game.players[COMPUTER];
  return <section className={`playtest-combat-desk combat-stage paper-stack state-${phase}`}>
    <header className="combat-stage-heading"><button type="button" onClick={() => location && onInspect(location)}><span>Current Scene</span><b>{location?.name ?? "Tournament Mat"}</b><small><i>SCENE RULE</i>{location?.rulesText ?? "The Department finds no reason to intervene."}</small></button><div><span>ROUND</span><b>{game.round}</b><small>{PHASE_WORD[phase]}</small></div></header>
    <div className="clash-field" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} aria-label="Combat stage. Drag a playable card here or use its button.">
      <StageSlot card={humanCard as MatCard | null} side="player" label={incoming ? "Your response" : "Your declaration"} onInspect={onInspect} />
      <div className="clash-seal" aria-label={`${hotZone ?? "No"} combat zone`}><span>{settled ? (exchange.damage > 0 ? "HIT" : "BLOCK") : PHASE_WORD[phase]}</span><b>{(hotZone ?? "—").slice(0, 1)}</b><small>{hotZone ?? "Choose a card"}</small></div>
      <StageSlot card={computerCard as MatCard | null} side="ai" label={incoming ? "Incoming strike" : "Opponent filing"} onInspect={onInspect} />
    </div>
    <div className="combat-zone-board" aria-label="Combat zones">{["High", "Mid", "Low"].map((zone) => <span className={hotZone?.includes(zone) ? "is-hot" : ""} key={zone}><b>{zone.slice(0, 1)}</b>{zone}</span>)}</div>
    <div className="live-mat-play live-mat-play--stage">
      <Lane label="Your filed cards" cards={human.played.filter((card) => !human.equipment.includes(card))} onInspect={onInspect} />
      <Lane label="Opponent filings" cards={computer.played.filter((card) => !computer.equipment.includes(card))} onInspect={onInspect} />
    </div>
    {exchange ? <blockquote className={`impact-readout exchange-receipt is-${exchange.damage > 0 ? "hit" : "block"}`} key={exchange.key}>
      <header><span>{exchange.damage > 0 ? "Impact certified" : "Block certified"}</span><b>{exchange.zone ?? exchange.attackCard?.zone ?? ""} · {exchange.reversal ? "REVERSAL" : "STRIKE"}</b></header>
      <p><strong>{exchange.attackCard?.name ?? "Attack"}</strong>{exchange.defenseCard ? <> met <strong>{exchange.defenseCard.name}</strong></> : <> met standing defense</>}</p>
      <div><b>{exchange.attack}<small>ATK</small></b><i>−</i><b>{exchange.block}<small>DEF</small></b><i>=</i><strong>{exchange.damage}<small>HP</small></strong></div>
      {exchange.notes.length ? <small>{exchange.notes.slice(0, 4).join(" · ")}</small> : null}
    </blockquote> : <blockquote className="impact-readout"><span>Latest filing</span><p>{log[0] ?? "The bell is about to ring."}</p></blockquote>}
    {coach && <p className="contextual-coach-slip"><span>Decision Coach</span><b>{coach}</b></p>}
  </section>;
}

function Lane({ label, cards, onInspect }: { label: string; cards: EngineCard[]; onInspect: (card: MatCard) => void }) {
  return <section className="mat-lane is-expanded" aria-label={`${label} cards currently on the Live Mat`}>
    <span className="mat-lane-toggle"><span>{label}</span><b>{cards.length ? `${cards.length} CARD${cards.length === 1 ? "" : "S"}` : "CLEAR"}</b></span>
    <div className="mat-lane-cards">{cards.length ? cards.map((card) => <button type="button" onClick={() => onInspect(card)} aria-label={`Inspect ${card.name} filing`} key={card.instanceId}>
      <span className="mat-card-visual">{artistUrl(card) ? <img src={artistUrl(card)} alt="" /> : <NativeCardArt card={card} />}</span>
      <span className="mat-card-copy"><b>{card.name}</b><small>{card.subtype || card.cardType}{card.zone ? ` · ${card.zone}` : ""}</small></span>
    </button>) : <p>No cards committed this turn.</p>}</div>
  </section>;
}

function AscendDesk({ game, view, legal, onView, onAct, onInspect, onClose, onFinish }: { game: EngineGame; view: DeskView; legal: EngineAction[]; onView: (view: DeskView) => void; onAct: (action: EngineAction) => void; onInspect: (card: MatCard) => void; onClose: () => void; onFinish: (() => void) | null }) {
  const human = game.players[HUMAN];
  const belts = game.definition.progression.belts;
  const nextBelt = belts[human.beltIndex + 1];
  const offer = human.comboOffered as MatCard | null;
  const learn = legal.find((action) => action.type === "learn-combo");
  const decline = legal.find((action) => action.type === "decline-combo");
  const promote = legal.find((action) => action.type === "promote");
  const recover = legal.find((action) => action.type === "recover-training-stripe");
  const live = game.activePlayer === HUMAN && game.phase === "Ascend";
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="ascend-desk-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} tabIndex={-1} className={`ascend-desk paper-stack ${live ? "ascend-desk--functional" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ascend-desk-title">
      <header className="ascend-desk-header">
        <div><span className="eyebrow">{live ? "Ascend review" : "Reference desk · inspection only"}</span><h2 id="ascend-desk-title">{view === "market" ? "Acquisition Desk" : view === "combo" ? "Combo Docket" : "Belt Check"}</h2><p>{live ? "Buy what you can afford, decide the Combo offer, and promote if you qualify. Finish the turn when you are done." : "Inspect this station without advancing the turn."}</p></div>
        <div className="ascend-desk-balance"><span>Available Focus</span><b>{human.focus}</b><small>{legal.filter((action) => action.type === "purchase").length} of {game.market.length} Market cards in reach</small></div>
        <button className="modal-close" onClick={onClose} aria-label="Close Ascend Desk">×</button>
      </header>
      <nav className="ascend-desk-stations" aria-label="Ascend stations">{(["market", "combo", "belt"] as const).map((station) => <button type="button" key={station} className={`button ${view === station ? "primary" : "ghost"}`} aria-current={view === station ? "page" : undefined} onClick={() => onView(station)}>{station === "market" ? "Market" : station === "combo" ? `Combo${offer ? " · offer" : ""}` : `Belt${promote ? " · ready" : ""}`}</button>)}</nav>
      <div className="ascend-desk-body">
        {view === "market" && <section className="ascend-market" aria-label="Shared Market">
          <header><div><span className="eyebrow">{game.market.length} live records · full cards</span><h3>Choose with the text visible</h3></div><p>Each purchase is replaced by the top Market card.</p></header>
          <div className="ascend-market-grid">{game.market.map((card) => { const buy = legal.find((action) => action.type === "purchase" && action.cardId === card.instanceId); return <PlayCard key={card.instanceId} card={card} price={String(game.purchaseCost(human, card))} hint={buy ? "Buy" : undefined} disabled={!buy} onClick={buy ? () => onAct(buy) : undefined} onInspect={() => onInspect(card)} />; })}</div>
        </section>}
        {view === "combo" && <section className="ascend-combo combo-panel">
          <header><div><span className="eyebrow">One face-up offer · one attempt per turn</span><h3>{human.learnedCombos.length}/2 learned</h3></div><span className="combo-limit">{human.comboAttemptedThisTurn ? "Attempt filed" : "Ready"}</span></header>
          {offer ? <div className="combo-offer"><NativeCardArt card={offer} /><div><span>{offer.catalogId}</span><h3>{offer.name}</h3><p>{offer.rulesText}</p><div><b>{num(offer.fpCost)} Focus</b><button onClick={() => onInspect(offer)}>Inspect full card</button></div></div></div> : <p>No Combo is on offer right now.</p>}
          {(learn || decline) && <div className="combo-actions">{learn && <button className="button primary" onClick={() => onAct(learn)}>Learn {offer?.name}</button>}{decline && <button className="button ghost" onClick={() => onAct(decline)}>Pass Combo</button>}</div>}
          {human.learnedCombos.length > 0 && <div className="learned-combos">{human.learnedCombos.map((combo) => <button key={combo.instanceId} onClick={() => onInspect(combo)}><span>∞</span><b>{combo.name}</b><small>Learned</small></button>)}</div>}
        </section>}
        {view === "belt" && <section className="ascend-belt belt-panel">
          <span className="eyebrow">Certification ledger</span><h3>{belts[human.beltIndex].name} Belt · {human.xp} XP</h3>
          <p>{nextBelt ? <><b>Next: {nextBelt.name} · {nextBelt.xp} XP.</b> {nextBelt.exam.summary} <em>{nextBelt.reward.summary}</em></> : "Every available Belt has been certified."}</p>
          <div className="belt-track">{belts.map((belt, index) => <span className={index <= human.beltIndex ? "earned" : ""} key={belt.name} style={{ "--belt-rank": belt.color } as CSSProperties} title={`${belt.name} Belt · ${belt.xp} XP · ${belt.exam.title}`}>{belt.name.slice(0, 1)}</span>)}</div>
          {promote ? <button className="button primary" onClick={() => onAct(promote)}>Promote to {nextBelt?.name} →</button> : nextBelt && <div className="belt-requirements" role="status"><span>{nextBelt.name} Belt · requirements</span><ul><li className={human.xp >= nextBelt.xp ? "is-met" : ""}><i aria-hidden="true">{human.xp >= nextBelt.xp ? "✓" : ""}</i>{nextBelt.xp} XP <small>{human.xp} filed</small></li><li><i aria-hidden="true" />{nextBelt.exam.title}</li>{!live && <li className="is-note"><i aria-hidden="true">!</i>Promotion opens during Ascend</li>}</ul></div>}
          {recover && <button className="button ghost" onClick={() => onAct(recover)}>Recover a Training Stripe</button>}
        </section>}
      </div>
      {onFinish && <footer className="ascend-desk-footer"><div className="ascend-guide-actions"><button className="button primary" onClick={onFinish}>Finish turn → Hide</button></div></footer>}
    </section>
  </div>;
}

function ChoiceDialog({ game, pending, onChoose }: { game: EngineGame; pending: EnginePending; onChoose: (optionId: string) => void }) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, [pending]);
  return <div className="playtest-inspector-backdrop effect-choice-backdrop"><section className="effect-choice-dialog paper-stack" role="dialog" aria-modal="true" aria-labelledby="effect-choice-title">
    <span className="eyebrow">Printed effect · your decision</span><h2 id="effect-choice-title">{choiceTitle(pending)}</h2><p>{choicePrompt(game, pending, HUMAN)}</p>
    <div className="effect-choice-options">{pending.options.map((option, index) => { const card = findInstance(game, option.id); return <button type="button" ref={index === 0 ? firstRef : undefined} onClick={() => onChoose(option.id)} key={option.id}><span>{card ? card.subtype || card.cardType : "OPTION"}</span><b>{option.label}</b><small>{card ? card.rulesText?.slice(0, 80) ?? card.catalogId : ""}</small></button>; })}</div>
  </section></div>;
}

function ResultCertificate({ game, onRematch, onExit }: { game: EngineGame; onRematch: () => void; onExit: () => void }) {
  const won = game.winner === HUMAN;
  const winner = game.players[game.winner ?? 0].character as MatCard;
  const art = artistUrl(winner);
  const human = game.players[HUMAN];
  return <section className={`match-result paper-stack ${won ? "is-victory" : "is-defeat"}`}>
    {won && <div className="victory-confetti" aria-hidden="true">{Array.from({ length: 44 }, (_, index) => <i className={`confetti-bit confetti-bit--${["action", "brass", "guard", "violet", "blue", "paper"][index % 6]}`} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 11) * .09}s` }} key={index} />)}</div>}
    <div className="ko-slam" aria-hidden="true"><b>K.O.!</b><span>{won ? "Opponent filed under defeated" : "You have been filed under defeated"}</span></div>
    <div className="victory-certificate">
      <div className="victory-stamp"><span>{won ? "VICTORY" : "CLOSED"}</span><b>{won ? "CERTIFIED" : "FIELD TEST"}</b></div>
      <div className="victory-fighter">
        <div className="victory-art-frame">{art ? <img src={art} alt={winner.name} /> : <NativeCardArt card={winner} />}<span>{won ? "OFFICIAL WINNER" : "OFFICIAL PROBLEM"}</span></div>
        <div className="victory-copy"><span className="eyebrow">Department of Questionably Regulated Martial Arts · {reasonLabel(game.reason)}</span><h2>{won ? `${winner.name} remains standing!` : `${winner.name} wins the field test.`}</h2><p>{won ? "Confetti has been authorized and the clipboard has been notified." : "The Department has approved an immediate rematch."}</p></div>
      </div>
      <dl className="match-report"><div><dt>{game.round}</dt><dd>Rounds</dd></div><div><dt>{human.xp}</dt><dd>XP filed</dd></div><div><dt>{human.purchases ?? 0}</dt><dd>Cards acquired</dd></div><div><dt>{human.learnedCombos.length}</dt><dd>Combos learned</dd></div></dl>
      <div className="victory-certificate-footer"><div className="victory-signature"><span>Certified by</span><b>Assistant Deputy Sensei, Filing Division</b><small>No one verified this signature.</small></div><div className="match-result-actions"><button className="button primary" onClick={onRematch}>Rematch</button><button className="button ghost" onClick={onExit}>Back to setup</button></div></div>
    </div>
  </section>;
}
