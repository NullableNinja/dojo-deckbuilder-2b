// Standard Clash table (rules Ch. 3, rulings DDB-RUL-101..103, 112): you against 2-5 engine bots,
// everyone free to attack anyone. The canonical headless engine owns every rule; this component
// only renders its state, offers its legal actions to you, and lets the bots take their turns.
import { useEffect, useMemo, useRef, useState } from "react";
import { clashCardByCatalogId, clashData, type EngineCard } from "./clash-engine.ts";
import { EngineSession, newSeed } from "./engine-session.ts";
import { PayrollSlip } from "./career-payroll";

type Seat = {
  id: number; name: string; character: EngineCard; hp: number; maxHp: number; xp: number; beltIndex: number; focus: number;
  hand: EngineCard[]; deck: EngineCard[]; discard: EngineCard[]; equipment: EngineCard[]; eliminated: boolean; tempo: boolean;
  learnedCombos: EngineCard[]; comboOffered: EngineCard | null; atk: number; def: number; speed: number; tempSpeed: number;
};
type Option = { id: string; label: string };
type Pending = { kind: string; playerId: number; attackerId?: number; cardId?: string; zone?: string; options: Option[] };
type Action = { type: string; playerId: number; cardId?: string; targetId?: number };
type EngineEvent = { type: string; round?: number; [key: string]: unknown };
type Engine = {
  players: Seat[]; phase: string; activePlayer: number; round: number; winner: number | null; reason: string; pendingChoice: Pending | null;
  market: EngineCard[]; currentLocation: EngineCard | null; events: EngineEvent[]; turnOrder: number[];
  definition: { progression: { belts: { name: string; color: string; xp: number }[] } };
  advanceAutomaticEvents(): void; getLegalActions(id: number): Action[]; applyAction(action: Action): boolean; resolveChoice(choice: { optionId: string }): boolean;
  defaultAction(legal: Action[]): Action; defaultChoice(): { optionId: string }; legalTargets(player: Seat): Seat[]; purchaseCost(player: Seat, card: EngineCard): number;
};

type Props = {
  fighterId: string;
  opponents: number;
  onExit: () => void;
  onRematch: () => void;
  artFor: (card: EngineCard) => string | undefined;
  fighterArtFor: (card: EngineCard) => string | undefined;
  placeholder: string;
  reducedMotion: boolean;
  difficulty?: string;
};

const HUMAN = 0;
const PHASE_LABEL: Record<string, string> = { Honor: "Honor", Initiate: "Initiate", Yell: "Yell", Ascend: "Ascend", Hide: "Hide" };
const PASS_LABEL: Record<string, string> = { Initiate: "Proceed to Yell", Yell: "Proceed to Ascend", Ascend: "Finish Ascend", Hide: "End turn (Hide)" };
const num = (value: unknown) => Number.parseInt(String(value ?? 0), 10) || 0;

/** Seat 0 is you; the other seats are distinct, randomly drawn fighters. */
function clashSession(fighterId: string, opponents: number, difficulty?: string) {
  const fighters = (clashData().cards as EngineCard[]).filter((card) => card.cardType === "Character");
  const human = fighters.find((card) => card.id === fighterId || card.catalogId === fighterId) ?? fighters[0];
  const pool = fighters.filter((card) => card.catalogId !== human.catalogId).sort(() => Math.random() - .5);
  return new EngineSession({ mode: "standard-clash", seed: newSeed(), fighters: [human, ...pool.slice(0, opponents)].map((card) => card.catalogId), humanSeats: [HUMAN], rulesVersion: "clash", difficulty });
}

export default function ClashTable({ fighterId, opponents, onExit, onRematch, artFor, fighterArtFor, placeholder, reducedMotion, difficulty }: Props) {
  const sessionRef = useRef<EngineSession | null>(null);
  if (!sessionRef.current) sessionRef.current = clashSession(fighterId, opponents, difficulty);
  const session = sessionRef.current;
  const game = session.game as unknown as Engine;
  const [tick, setTick] = useState(0);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);
  const rerender = () => setTick((value) => value + 1);
  const human = game.players[HUMAN];
  const belts = game.definition.progression.belts;
  const over = game.winner !== null;
  const humanOut = human.eliminated;

  // Bots (and automatic Honor) advance one visible beat at a time.
  const humanToAct = !over && (game.pendingChoice ? game.pendingChoice.playerId === HUMAN : game.activePlayer === HUMAN && game.phase !== "Honor");
  useEffect(() => {
    if (over || (humanToAct && !humanOut) || (humanOut && !watching)) return;
    const timer = window.setTimeout(() => {
      session.stepBots();
      rerender();
    }, reducedMotion ? 120 : 520);
    return () => window.clearTimeout(timer);
    // tick drives the loop; the engine object is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, over, humanToAct, humanOut, watching]);

  const legal = !over && !game.pendingChoice && game.activePlayer === HUMAN ? game.getLegalActions(HUMAN) : [];
  const targets = game.legalTargets(human);
  const target = targets.find((seat) => seat.id === targetId) ?? targets[0] ?? null;
  const act = (action: Action) => { if (session.act(action)) rerender(); };
  const choose = (optionId: string) => { if (session.choose(optionId)) rerender(); };
  const pass = legal.find((action) => action.type === "pass" || action.type === "hide");
  const actionsFor = (card: EngineCard) => legal.filter((action) => action.cardId === card.instanceId);

  const log = useMemo(() => formatLog(game), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = game.pendingChoice && game.pendingChoice.playerId === HUMAN && !human.eliminated ? game.pendingChoice : null;
  const location = game.currentLocation;
  const activeSeat = game.players[game.activePlayer];

  return <main className="playtest-shell clash-table shell" aria-labelledby="clash-title">
    <header className="clash-head">
      <div>
        <span className="eyebrow">Standard Clash · {game.players.length} fighters · free-for-all</span>
        <h1 id="clash-title">Round {game.round} · {over ? "Final bell" : `${activeSeat.id === HUMAN ? "Your" : `${activeSeat.character.name}'s`} ${PHASE_LABEL[game.phase] ?? game.phase}`}</h1>
      </div>
      {location && <div className="clash-location" title={location.rulesText ?? ""}><span>Current scene</span><b>{location.name}</b><small>{location.rulesText}</small></div>}
      <button type="button" className="button ghost" onClick={onExit}>Leave the clash</button>
    </header>

    <section className="clash-seats" aria-label="Fighters at the table">
      {game.players.map((seat) => {
        const isTarget = target?.id === seat.id && seat.id !== HUMAN;
        const targetable = game.activePlayer === HUMAN && game.phase === "Yell" && targets.some((candidate) => candidate.id === seat.id);
        const art = fighterArtFor(seat.character) ?? artFor(seat.character) ?? placeholder;
        const hpPercent = Math.round(seat.hp / Math.max(1, seat.maxHp) * 100);
        const belt = belts[seat.beltIndex];
        const body = <>
          <span className="clash-seat-art"><img src={art} alt="" />{seat.eliminated && <b>K.O.</b>}</span>
          <span className="clash-seat-copy">
            <small>{seat.id === HUMAN ? "You" : `Seat ${seat.id + 1}`}{game.activePlayer === seat.id && !over ? " · acting" : ""}</small>
            <b>{seat.character.name}</b>
            <span className="clash-hp" role="meter" aria-label={`${seat.character.name} HP`} aria-valuemin={0} aria-valuemax={seat.maxHp} aria-valuenow={seat.hp}><i style={{ width: `${hpPercent}%` }} /></span>
            <span className="clash-seat-facts"><em>{seat.hp}/{seat.maxHp} HP</em><em style={{ "--belt": belt?.color } as React.CSSProperties} className="clash-belt">{belt?.name}</em><em>{seat.xp} XP</em><em>{seat.hand.length} in hand</em></span>
            {seat.equipment.length > 0 && <span className="clash-gear">{seat.equipment.map((card) => card.name).join(" · ")}</span>}
          </span>
        </>;
        const className = `clash-seat${seat.id === HUMAN ? " is-you" : ""}${seat.eliminated ? " is-out" : ""}${game.activePlayer === seat.id && !over ? " is-active" : ""}${isTarget ? " is-target" : ""}`;
        return targetable
          ? <button type="button" key={seat.id} className={className} aria-pressed={isTarget} onClick={() => setTargetId(seat.id)} aria-label={`Target ${seat.character.name}`}>{body}{isTarget && <span className="clash-target-stamp">Target</span>}</button>
          : <div key={seat.id} className={className}>{body}{isTarget && game.activePlayer === HUMAN && <span className="clash-target-stamp">Target</span>}</div>;
      })}
    </section>

    <section className="clash-desk">
      <div className="clash-status">
        <span><b>{human.focus}</b> Focus</span>
        <span><b>{human.xp}</b> XP · {belts[human.beltIndex]?.name} Belt</span>
        <span>ATK <b>{human.atk}</b> · DEF <b>{human.def}</b> · SPD <b>{human.speed + human.tempSpeed}</b></span>
        <span>{human.tempo ? "Tempo ready" : "Tempo used"}</span>
        <span>Deck {human.deck.length} · Discard {human.discard.length}</span>
        {game.activePlayer === HUMAN && !over && game.phase === "Yell" && target && <span className="clash-target-note">Attacks go to <b>{target.character.name}</b>. Tap a fighter to switch.</span>}
        {pass && <button type="button" className="button primary clash-pass" onClick={() => act(pass)}>{PASS_LABEL[game.phase] ?? "Pass"} <span aria-hidden="true">→</span></button>}
        {!pass && !over && !humanToAct && <span className="clash-waiting"><i /><i /><i /> {game.pendingChoice ? `${game.players[game.pendingChoice.playerId]?.character.name ?? "A fighter"} is deciding` : `${activeSeat.character.name} is acting`}</span>}
      </div>

      {game.activePlayer === HUMAN && game.phase === "Ascend" && !over && <div className="clash-market" aria-label="Market">
        {legal.filter((action) => action.type === "promote").map((action) => <button key="promote" type="button" className="button primary" onClick={() => act(action)}>Promote to {belts[human.beltIndex + 1]?.name} Belt</button>)}
        {human.comboOffered && <div className="clash-combo"><b>Combo offer: {human.comboOffered.name}</b><small>{human.comboOffered.rulesText}</small>
          {legal.filter((action) => action.type === "learn-combo").map((action) => <button key="learn" type="button" className="button" onClick={() => act(action)}>Learn ({num(human.comboOffered?.fpCost)} Focus)</button>)}
          {legal.filter((action) => action.type === "decline-combo").map((action) => <button key="decline" type="button" className="button ghost" onClick={() => act(action)}>Return it</button>)}
        </div>}
        <ol className="clash-market-row">{game.market.map((card) => {
          const buy = legal.find((action) => action.type === "purchase" && action.cardId === card.instanceId);
          return <li key={card.instanceId}><CardTile card={card} art={artFor(card) ?? placeholder} />{buy ? <button type="button" className="button primary" onClick={() => act(buy)}>Buy · {game.purchaseCost(human, card)}</button> : <span className="clash-price">{game.purchaseCost(human, card)} Focus</span>}</li>;
        })}</ol>
      </div>}

      <div className="clash-hand" aria-label="Your hand">
        {human.hand.map((card) => {
          const actions = actionsFor(card);
          return <div className="clash-hand-card" key={card.instanceId}>
            <CardTile card={card} art={artFor(card) ?? placeholder} />
            <div className="clash-card-actions">{actions.map((action) => <button type="button" key={action.type} className={`button ${action.type === "play-attack" ? "primary" : "ghost"}`} onClick={() => act(action.type === "play-attack" && target ? { ...action, targetId: target.id } : action)}>{
              action.type === "play-attack" ? `Attack ${target ? target.character.name.split(/[ ,]/)[0] : ""}` : action.type === "practice" ? "Practice" : game.phase === "Initiate" ? "Equip" : "Play"
            }</button>)}</div>
          </div>;
        })}
      </div>
    </section>

    <aside className="clash-log" aria-label="Fight log" aria-live="polite"><span className="eyebrow">Fight log</span><ol>{log.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ol></aside>

    {pending && <div className="clash-choice-backdrop" role="dialog" aria-modal="true" aria-labelledby="clash-choice-title">
      <div className="clash-choice">
        <span className="eyebrow">{pending.kind === "defense" || pending.kind === "reaction" ? "Incoming strike" : "Your decision"}</span>
        <h2 id="clash-choice-title">{choiceTitle(game, pending)}</h2>
        <div className="clash-choice-options">{pending.options.map((option, index) => <button type="button" key={option.id} className={`button ${index === 0 ? "ghost" : "primary"}`} autoFocus={index === 0} onClick={() => choose(option.id)}>{option.label}</button>)}</div>
      </div>
    </div>}

    {(over || (humanOut && !watching)) && <div className="clash-choice-backdrop" role="dialog" aria-modal="true" aria-labelledby="clash-result-title">
      <div className={`clash-choice clash-result${game.winner === HUMAN ? " is-victory" : ""}`}>
        <span className="eyebrow">{over ? `Final bell · ${reasonLabel(game.reason)}` : "You have been knocked out"}</span>
        <h2 id="clash-result-title">{over ? (game.winner === HUMAN ? "You win the Clash!" : `${game.players[game.winner!].character.name} wins the Clash.`) : "Out of the clash."}</h2>
        <p>{over ? `Round ${game.round}. ${game.players.filter((seat) => !seat.eliminated).length} still standing.` : "The rest of the table is still swinging."}</p>
        {over && <PayrollSlip session={session} />}
        <div className="clash-choice-options">
          {!over && <button type="button" className="button ghost" onClick={() => setWatching(true)}>Watch it play out</button>}
          <button type="button" className="button primary" onClick={onRematch}>New Clash</button>
          <button type="button" className="button ghost" onClick={onExit}>Back to setup</button>
        </div>
      </div>
    </div>}
  </main>;
}

function CardTile({ card, art }: { card: EngineCard; art: string }) {
  const power = num(card.stats?.["Attack Power"]); const guard = num(card.stats?.Guard);
  return <article className={`clash-card clash-card--${(card.subtype ?? card.cardType).toLocaleLowerCase().replace(/[^a-z]+/g, "-")}`} title={card.rulesText ?? card.name}>
    <img src={art} alt="" loading="lazy" />
    <span className="clash-card-copy"><small>{card.subtype ?? card.cardType}{card.zone && card.zone !== "—" ? ` · ${card.zone}` : ""}</small><b>{card.name}</b>
      <em>{power ? `${power} Power` : guard ? `${guard} Guard` : card.rulesText ? card.rulesText.slice(0, 70) + (card.rulesText.length > 70 ? "…" : "") : ""}</em></span>
  </article>;
}

const seatName = (game: Engine, id: unknown) => typeof id === "number" && game.players[id] ? (id === HUMAN ? "You" : game.players[id].character.name) : "Someone";
const ownerOf = (game: Engine, id: unknown) => id === HUMAN ? "your" : `${seatName(game, id)}'s`;
const cardName = (catalogId: unknown) => typeof catalogId === "string" ? clashCardByCatalogId(catalogId)?.name ?? catalogId : "";

function choiceTitle(game: Engine, pending: Pending) {
  if (pending.kind === "defense" || pending.kind === "reaction") {
    const attacker = seatName(game, pending.attackerId);
    // The declared Attack stays in the attacker's hand until the strike resolves.
    const attack = game.players[pending.attackerId ?? 0]?.hand.find((card) => card.instanceId === pending.cardId);
    return `${attacker} attacks you${attack ? ` with ${attack.name}` : ""}${pending.zone ? ` (${pending.zone})` : ""}. ${pending.kind === "reaction" ? "Play a Reaction?" : "Choose a Defense."}`;
  }
  if (pending.kind === "attack-zone") return "Choose a zone for this Attack.";
  return "Choose one.";
}

function reasonLabel(reason: string) {
  return ({ "last-fighter-standing": "last fighter standing", "black-belt": "Black Belt Victory", "round-limit": "round limit", "simultaneous-knockout": "simultaneous knockout" } as Record<string, string>)[reason] ?? reason;
}

function formatLog(game: Engine) {
  const lines: string[] = [];
  for (const event of game.events.slice(-80)) {
    if (event.type === "attack") lines.push(Number(event.damage) > 0
      ? `${seatName(game, event.attacker)} hit ${seatName(game, event.defender)} with ${cardName(event.card)} for ${event.damage} (${event.attack} vs ${event.block}).`
      : `${seatName(game, event.defender)} blocked ${ownerOf(game, event.attacker)} ${cardName(event.card)}${event.defense ? ` with ${cardName(event.defense)}` : ""} (${event.attack} vs ${event.block}).`);
    else if (event.type === "knockout") lines.push(`K.O.! ${seatName(game, event.player)} is down${typeof event.by === "number" ? `, credited to ${seatName(game, event.by)} (+2 XP)` : ""}.`);
    else if (event.type === "elimination") lines.push(`${seatName(game, event.player)} ${event.player === HUMAN ? "are" : "is"} eliminated.`);
    else if (event.type === "promotion") lines.push(`${seatName(game, event.player)} promoted to ${event.belt} Belt.`);
    else if (event.type === "scene-change") lines.push(`Scene Change: ${cardName(event.location)}.`);
    else if (event.type === "victory") lines.push(`${seatName(game, event.player)} ${event.player === HUMAN ? "win" : "wins"} by ${reasonLabel(String(event.reason))}.`);
  }
  return lines.slice(-14).reverse();
}
