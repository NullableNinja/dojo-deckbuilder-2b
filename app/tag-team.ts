// Tag Team: Swap-Fu roster rules for the browser game (rules Ch. 13 and 16, rulings
// DDB-RUL-104..106 and 115). Pure functions over any board that carries a roster.
//
// The active fighter's Character-owned state is mirrored on the board itself, so every
// existing Quick Duel rule keeps reading board.hp, board.equipment and board.fighterId.
// Benched fighters keep their own HP, Equipment and statuses in board.roster.
// Player-owned state (deck, hand, Focus, XP, Belt, Tempo, Combos) never moves.

export const FIGHTER_KEYS = ["fighterId", "hp", "maxHp", "equipment", "exhaustedEquipment", "tempSpeed", "stage3cStatuses", "abilityUsedRound", "characterMarks"] as const;

type FighterKey = typeof FIGHTER_KEYS[number];

export type RosterFighter = {
  fighterId: string;
  hp: number;
  maxHp: number;
  equipment: string[];
  exhaustedEquipment?: string[];
  tempSpeed: number;
  stage3cStatuses?: unknown[];
  abilityUsedRound: boolean;
  characterMarks?: Record<string, unknown>;
  knockedOut: boolean;
};

export type RosterBoard = {
  fighterId: string;
  hp: number;
  maxHp: number;
  equipment: string[];
  exhaustedEquipment?: string[];
  tempSpeed: number;
  stage3cStatuses?: unknown[];
  abilityUsedRound: boolean;
  characterMarks?: Record<string, unknown>;
  discard: string[];
  playArea: string[];
  cardsThisTurn: string[];
  xp: number;
  roster?: RosterFighter[];
  activeIndex?: number;
  /** One tag per turn (Ch. 13). Cleared when that side's next turn begins. */
  taggedThisTurn?: boolean;
  /** The owner's pick for who replaces a knocked-out fighter (DDB-RUL-115). */
  nextInIndex?: number | null;
};

export const hasRoster = (board: RosterBoard) => Array.isArray(board.roster) && board.roster.length > 1;

export function createRoster<B extends RosterBoard>(board: B, fighterIds: string[], hp: number): B {
  const roster: RosterFighter[] = fighterIds.map((fighterId) => ({ fighterId, hp, maxHp: hp, equipment: [], exhaustedEquipment: [], tempSpeed: 0, stage3cStatuses: [], abilityUsedRound: false, characterMarks: {}, knockedOut: false }));
  return { ...board, fighterId: fighterIds[0], hp, maxHp: hp, roster, activeIndex: 0, taggedThisTurn: false, nextInIndex: null };
}

function pickFighter(board: RosterBoard, knockedOut: boolean): RosterFighter {
  const fighter = { knockedOut } as RosterFighter;
  for (const key of FIGHTER_KEYS) (fighter as Record<FighterKey, unknown>)[key] = structuredClone(board[key] ?? (key === "equipment" || key === "exhaustedEquipment" || key === "stage3cStatuses" ? [] : key === "characterMarks" ? {} : board[key]));
  return fighter;
}

/** The live roster: the stored bench plus the active fighter's mirrored state. */
export function liveRoster(board: RosterBoard): RosterFighter[] {
  if (!hasRoster(board)) return [];
  const active = board.activeIndex ?? 0;
  return board.roster!.map((fighter, index) => index === active ? pickFighter(board, fighter.knockedOut) : fighter);
}

export function consciousBench(board: RosterBoard): number[] {
  if (!hasRoster(board)) return [];
  const active = board.activeIndex ?? 0;
  return board.roster!.map((fighter, index) => ({ fighter, index })).filter(({ fighter, index }) => index !== active && !fighter.knockedOut && fighter.hp > 0).map(({ index }) => index);
}

/** A side is still standing while its active fighter is conscious or a benched one can tag in. */
export const isStanding = (board: RosterBoard) => board.hp > 0 || consciousBench(board).length > 0;

export function swapActive<B extends RosterBoard>(board: B, index: number): B {
  if (!hasRoster(board)) return board;
  const roster = liveRoster(board);
  const incoming = roster[index];
  const next = { ...board, roster, activeIndex: index } as B;
  for (const key of FIGHTER_KEYS) (next as Record<string, unknown>)[key] = structuredClone(incoming[key]);
  return next;
}

/** Tag once during your Initiate, before equipping anything (Ch. 13). */
export function canTag(board: RosterBoard, initiate: boolean) {
  return initiate && hasRoster(board) && !board.taggedThisTurn && board.cardsThisTurn.length === 0 && consciousBench(board).length > 0;
}

export function tagIn<B extends RosterBoard>(board: B, index: number): B {
  if (!consciousBench(board).includes(index)) return board;
  return { ...swapActive(board, index), taggedThisTurn: true, nextInIndex: board.nextInIndex === index ? null : board.nextInIndex };
}

/** Bots tag a badly hurt fighter out for a clearly healthier one. */
export function botTagChoice(board: RosterBoard): number | null {
  if (!hasRoster(board) || board.taggedThisTurn) return null;
  const bench = consciousBench(board).map((index) => ({ index, hp: board.roster![index].hp })).sort((left, right) => right.hp - left.hp);
  return bench.length && board.hp <= 8 && bench[0].hp >= board.hp + 6 ? bench[0].index : null;
}

export function replacementIndex(board: RosterBoard): number | null {
  const bench = consciousBench(board);
  if (!bench.length) return null;
  if (board.nextInIndex !== null && board.nextInIndex !== undefined && bench.includes(board.nextInIndex)) return board.nextInIndex;
  return [...bench].sort((left, right) => board.roster![right].hp - board.roster![left].hp || left - right)[0];
}

export type KnockoutResult<B> = { board: B; knockedOutId: string; replacementId: string | null };

/**
 * Knockout procedure for a roster (Ch. 16 steps 4 and 6): discard the KO'd fighter's
 * permanent Equipment, clear its statuses, then the owner's chosen conscious benched
 * fighter becomes active immediately. KO XP is awarded by the combat that caused it.
 */
export function knockOutActive<B extends RosterBoard>(board: B): KnockoutResult<B> | null {
  if (!hasRoster(board) || board.hp > 0) return null;
  const active = board.activeIndex ?? 0;
  if (board.roster![active]?.knockedOut) return null; // already processed: settle is idempotent
  const knockedOutId = board.fighterId;
  const discarded = [...board.equipment];
  const cleared = {
    ...board,
    hp: 0,
    equipment: [],
    exhaustedEquipment: [],
    tempSpeed: 0,
    stage3cStatuses: [],
    discard: [...board.discard, ...discarded],
    playArea: board.playArea.filter((id) => !discarded.includes(id)),
  } as B;
  const roster = liveRoster(cleared).map((fighter, index) => index === active ? { ...fighter, hp: 0, knockedOut: true } : fighter);
  const withRoster = { ...cleared, roster } as B;
  const next = replacementIndex(withRoster);
  if (next === null) return { board: withRoster, knockedOutId, replacementId: null };
  const replaced = { ...swapActive(withRoster, next), nextInIndex: null } as B;
  return { board: replaced, knockedOutId, replacementId: replaced.fighterId };
}

export const fightersRemaining = (board: RosterBoard) => hasRoster(board) ? liveRoster(board).filter((fighter) => !fighter.knockedOut && fighter.hp > 0).length : board.hp > 0 ? 1 : 0;
