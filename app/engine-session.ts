// A browser session around the canonical engine: who sits where, which seats are human, and
// the full list of decisions taken. Setup + decisions is the whole game, so the same record
// drives save/resume, rematches and (later) peer-to-peer play. Framework-free on purpose.
import { Game } from "../engine/core.mjs";
import { clashData, type EngineCard } from "./clash-engine.ts";

export type EngineOption = { id: string; label: string };
export type EnginePending = { kind: string; playerId: number; attackerId?: number; targetPlayerId?: number; cardId?: string; zone?: string; options: EngineOption[]; [key: string]: unknown };
export type EngineAction = { type: string; playerId: number; cardId?: string; targetId?: number; zone?: string; fighterIndex?: number; replaceCardIds?: string[] };
export type EngineEvent = { type: string; [key: string]: unknown };
export type EngineStatus = { id?: string; action: string; amount?: number; value?: unknown; duration?: string; sourceId?: string };
export type EngineSeat = {
  id: number; character: EngineCard; hp: number; maxHp: number; xp: number; beltIndex: number; focus: number; tempo: boolean;
  atk: number; def: number; speed: number; tempSpeed: number; eliminated?: boolean;
  hand: EngineCard[]; deck: EngineCard[]; discard: EngineCard[]; played: EngineCard[]; equipment: EngineCard[]; destroyed: EngineCard[];
  exhaustedEquipment: string[]; statuses: EngineStatus[]; learnedCombos: EngineCard[]; comboOffered: EngineCard | null;
  comboAttemptedThisTurn?: boolean; practiceUsed?: boolean; badHabitFocusUsed?: boolean; attackCount?: number;
  completedTasks: number[]; trainingStripes?: unknown; purchases?: number; plays?: number;
};
export type EngineGame = {
  seed: number; players: EngineSeat[]; phase: string; activePlayer: number; round: number; turnOrder: number[];
  winner: number | null; reason: string; pendingChoice: EnginePending | null;
  market: EngineCard[]; marketDeck: EngineCard[]; comboDeck?: EngineCard[]; currentLocation: EngineCard | null; events: EngineEvent[];
  definition: { rulesVersion: string; progression: { belts: { id: string; name: string; color: string; xp: number; exam: { title: string; summary: string }; reward: { summary: string } }[] }; economy: { badHabitFocus?: { catalogId: string } } };
  advanceAutomaticEvents(): void; getLegalActions(id: number): EngineAction[]; applyAction(action: EngineAction): boolean; resolveChoice(choice: { optionId: string }): boolean;
  defaultAction(legal: EngineAction[]): EngineAction; defaultChoice(): { optionId: string };
  legalTargets(player: EngineSeat): EngineSeat[]; purchaseCost(player: EngineSeat, card: EngineCard): number;
  canPromote(player: EngineSeat): boolean; statusValue(player: EngineSeat, action: string): number;
};

export type SessionSetup = {
  mode: "quick-duel" | "standard-clash";
  seed: number;
  /** Fighter catalog IDs by seat. */
  fighters: string[];
  humanSeats: number[];
  rulesVersion: string;
  /** Table options from content/dojo-game.json `tableOptions` (tempo, locations, market, house rules). */
  table?: TableOptions;
};
export type TableOptions = { tempo?: boolean; locations?: boolean; openMarket?: boolean; balancedMarket?: boolean; houseRules?: string[] };
export type Decision = { kind: "action"; action: EngineAction } | { kind: "choice"; optionId: string };
export type SavedSession = { format: 1; setup: SessionSetup; decisions: Decision[] };
export type BotPolicy = { chooseAction(game: EngineGame, legal: EngineAction[]): EngineAction; chooseChoice(game: EngineGame, pending: EnginePending): { optionId: string } };

const VISIBLE_BEATS = new Set(["attack", "knockout", "elimination", "promotion", "victory", "scene-change", "combo-completed", "purchase"]);
const defaultPolicy: BotPolicy = { chooseAction: (game, legal) => game.defaultAction(legal), chooseChoice: (game) => game.defaultChoice() };

function characterFor(catalogId: string) {
  const cards = clashData().cards as EngineCard[];
  const card = cards.find((entry) => entry.cardType === "Character" && (entry.catalogId === catalogId || entry.id === catalogId));
  if (!card) throw new Error(`Unknown fighter ${catalogId}`);
  return card;
}

export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31) || 1;
}

export class EngineSession {
  readonly game: EngineGame;
  readonly setup: SessionSetup;
  readonly decisions: Decision[] = [];
  private policy: BotPolicy;

  constructor(setup: SessionSetup, policy: BotPolicy = defaultPolicy) {
    this.setup = setup;
    this.policy = policy;
    this.game = new Game(clashData(), {
      seed: setup.seed,
      mode: setup.mode,
      players: setup.fighters.length,
      characters: setup.fighters.map(characterFor),
      strategies: setup.fighters.map(() => "balanced"),
      ...(setup.table ? { table: setup.table } : {}),
    }) as unknown as EngineGame;
    this.game.advanceAutomaticEvents();
  }

  /** Rebuild a saved game by replaying its decisions; null if the save no longer replays. */
  static restore(saved: SavedSession, policy?: BotPolicy): EngineSession | null {
    if (saved?.format !== 1 || !saved.setup) return null;
    try {
      const session = new EngineSession(saved.setup, policy);
      for (const decision of saved.decisions) if (!session.apply(decision)) return null;
      return session;
    } catch {
      return null;
    }
  }

  save(): SavedSession {
    return { format: 1, setup: this.setup, decisions: [...this.decisions] };
  }

  get over() { return this.game.winner !== null; }

  isHuman(seat: number) { return this.setup.humanSeats.includes(seat); }

  /** The seat whose input the game is waiting on, or null when it can advance by itself. */
  waitingOn(): number | null {
    const { game } = this;
    if (game.winner !== null) return null;
    if (game.pendingChoice) return game.pendingChoice.playerId;
    if (game.phase === "Honor") return null;
    return game.activePlayer;
  }

  humanToAct() {
    const seat = this.waitingOn();
    return seat !== null && this.isHuman(seat) && !this.game.players[seat].eliminated;
  }

  legalFor(seat: number): EngineAction[] {
    const { game } = this;
    if (game.winner !== null || game.pendingChoice || game.activePlayer !== seat || game.phase === "Honor") return [];
    return game.getLegalActions(seat);
  }

  act(action: EngineAction) { return this.apply({ kind: "action", action }); }

  choose(optionId: string) { return this.apply({ kind: "choice", optionId }); }

  /**
   * Let computer seats (and automatic Honor) move until a human must act, the game ends,
   * or something worth watching happens. Returns the events produced.
   */
  stepBots(maxSteps = 40): EngineEvent[] {
    const { game } = this;
    const before = game.events.length;
    for (let step = 0; step < maxSteps && game.winner === null; step += 1) {
      game.advanceAutomaticEvents();
      const seat = this.waitingOn();
      if (seat === null) break;
      if (this.isHuman(seat) && !game.players[seat].eliminated) break;
      if (!this.botMove(seat)) break;
      if (game.events.slice(before).some((event) => VISIBLE_BEATS.has(event.type))) break;
    }
    return game.events.slice(before);
  }

  /** One computer decision. If the policy picks something the engine refuses, try the other options. */
  private botMove(seat: number) {
    const { game } = this;
    const pending = game.pendingChoice;
    if (pending) {
      const preferred = this.policy.chooseChoice(game, pending).optionId;
      const ordered = [preferred, ...pending.options.map((option) => option.id).filter((id) => id !== preferred)];
      if (ordered.some((optionId) => this.apply({ kind: "choice", optionId }))) return true;
      this.stuck = { kind: pending.kind, playerId: pending.playerId, options: pending.options.map((option) => option.id) };
      return false;
    }
    const legal = game.getLegalActions(seat);
    const preferred = this.policy.chooseAction(game, legal);
    return [preferred, ...legal.filter((action) => action !== preferred)].some((action) => this.apply({ kind: "action", action }));
  }

  /** Set when the engine offered a decision none of whose options it would accept (an engine bug). */
  stuck: { kind: string; playerId: number; options: string[] } | null = null;

  private apply(decision: Decision) {
    const { game } = this;
    game.advanceAutomaticEvents();
    const applied = decision.kind === "choice" ? game.resolveChoice({ optionId: decision.optionId }) : game.applyAction(decision.action);
    if (!applied) return false;
    this.decisions.push(decision);
    game.advanceAutomaticEvents();
    return true;
  }
}
