// Career store: the player's Merit, Clearance Level, Booster Tickets, Ticket Stubs, Starter Kits and
// opened cards, kept in this browser (docs/packs-and-progression-plan.md, "Storage").
//
// Framework-free. The rules of the economy live in engine/collection.mjs and read content/packs.json;
// this module only stores, backs up, exports and imports the state, and answers the questions the
// pages ask ("what may this table play with?", "what did that match pay?").
//
// Storage contract:
//   - `paper-fu-career-v1` holds { checksum, data } and `paper-fu-career-v1-backup` the previous good record.
//   - Every read and write is wrapped in try/catch; blocked storage means no career, never a crash.
//   - A corrupt primary is restored from the backup. A record from a newer schema is never overwritten:
//     the career opens read-only so it can still be exported.
import packsJson from "../content/packs.json" with { type: "json" };
import cardsJson from "./data/cards.json" with { type: "json" };
import { CAREER_SCHEMA, createEconomy } from "../engine/collection.mjs";

export const CAREER_KEY = "paper-fu-career-v1";
export const CAREER_BACKUP_KEY = "paper-fu-career-v1-backup";
const CODE_PREFIX = "PFC1";

export type Wallet = Record<string, number>;
export type PackRecord = { serial: number; series: string; cards: string[]; at: string | null };
export type CareerState = {
  schema: number;
  profileId: string;
  createdAt: string;
  packsRevision: string;
  rngSeed: number;
  packSerial: number;
  starterKits: string[];
  opened: string[];
  packHistory: PackRecord[];
  wallet: Wallet;
  merit: number;
  claimedLevels: number[];
  bonusRewards: number;
  streak: { current: number; best: number; lastWinDay: string | null };
  stats: { wins: number; losses: number; byMode: Record<string, { wins: number; losses: number }> };
  receipts: { matchId: string; mode: string; result: string; merit: number; tickets: number; stubs: number; at: string | null }[];
  /** The player's Open Dojo switch: play with the full catalog, earn nothing. */
  openDojo: boolean;
};
export type Reward = { kind: string; count?: number; pack?: string; catalogId?: string; name?: string; id?: string; choiceGroup?: string };
export type PayrollLine = { id: string; merit: number; tickets: number; stubs: number; times?: number; multiplier?: { kind: "difficulty" | "stage"; key: string; value: number } | null };
export type Payroll = {
  eligible: boolean;
  reason: "unlock-everything" | "open-dojo" | "too-short" | "already-paid" | "no-career" | null;
  lines: PayrollLine[];
  merit: number; tickets: number; stubs: number;
  levelBefore: number; levelAfter: number;
  levels: { level: number; bonus?: number; rewards: Reward[] }[];
  stubsExchanged: number; ticketsConverted: number; meritFromTickets: number;
  unlocked: { characters: string[]; bosses: string[] };
};
export type MatchReceipt = { matchId: string; mode: string; table: string; result: "win" | "loss"; rounds: number; difficulty?: string; promotions: number; opponents: number; bossStage?: string; day: string; at: string };
export type SeriesStatus = { id: string; name: string; unlockLevel: number | null; unlocked: boolean; owned: number; total: number; complete: boolean; completionReward: Reward | null };
export type UnlockSourceInfo =
  | { kind: "starting" } | { kind: "standard" }
  | { kind: "level"; level: number }
  | { kind: "series"; series: string; seriesName: string }
  | { kind: "booster"; series: string; seriesName: string; level: number | null }
  | { kind: "every-profile" | "starter-kit"; pack: string; packName: string };
export type LevelProgress = { level: number; maxed: boolean; floor: number; next: number | null; into: number; span: number };
type Manifest = { cards: string[]; bosses: string[] };
type Diploma = { id: string; name: string; belt: string; fromLevel: number };
type PackDefinition = { id: string; kind: string; name: string; tagline: string; grant?: string; themeBuildPaths: string[]; cards: { catalogId: string; name: string }[]; completionReward?: Reward };

/** The economy bound to content/packs.json and the card catalog (engine/collection.mjs). */
export type Economy = {
  packs: typeof packsJson;
  unlockEverything: boolean;
  cardsPerPack: number;
  boosters: PackDefinition[];
  kits: PackDefinition[];
  everyProfile: PackDefinition[];
  levels: { level: number; meritTotal: number; rewards: Reward[] }[];
  levelFor(merit: number): number;
  levelProgress(merit: number): LevelProgress;
  diplomaFor(level: number): Diploma;
  pendingKitChoices(state: CareerState): number;
  ownedCards(state: CareerState): Set<string>;
  seriesStatus(state: CareerState): SeriesStatus[];
  unlockedRoster(state: CareerState): { characters: Set<string>; bosses: Set<string> };
  unlockSource(catalogId: string): UnlockSourceInfo;
  collectionComplete(state: CareerState): boolean;
  settle(state: CareerState): { state: CareerState };
  newCareer(seed: { profileId: string; createdAt: string; rngSeed: number }): CareerState;
  chooseStarterKit(state: CareerState, kitId: string): CareerState;
  boosterBlocker(state: CareerState, seriesId: string): "unknown-series" | "locked" | "complete" | "no-ticket" | null;
  openBooster(state: CareerState, seriesId: string, at?: string | null): { state: CareerState; cards: string[]; error: string | null };
  applyMatchResult(state: CareerState, receipt: MatchReceipt): { state: CareerState; payroll: Payroll };
  manifest(state: CareerState): Manifest;
  poolIsPlayable(catalogIds: string[]): boolean;
  resolveMatchPool(manifests: Manifest[]): string[] | null;
  mergeCareers(local: CareerState, imported: CareerState): CareerState;
};

type CatalogCard = { catalogId: string; deck: string; subtype?: string; zone?: string; name: string };
export const economy = createEconomy(packsJson, (cardsJson as unknown as { cards: CatalogCard[] }).cards) as Economy;
export const TICKET = "booster-ticket";
export const STUB = "ticket-stub";

// ---- Checksums and codes --------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** CRC32 of a string's UTF-8 bytes, as 8 hex digits. */
export function crc32(text: string) {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

const toBase64Url = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));

async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}
const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/** Opened cards as one bitset per Catalog ID prefix ("DDB-ATK-CORE" → bits for 001, 002, …). */
export function encodeCardSet(catalogIds: string[]) {
  const groups = new Map<string, number[]>();
  const loose: string[] = [];
  for (const catalogId of catalogIds) {
    const match = /^(.*)-(\d+)$/.exec(catalogId);
    if (!match) { loose.push(catalogId); continue; }
    groups.set(match[1], [...(groups.get(match[1]) ?? []), Number(match[2])]);
  }
  const bits = Object.fromEntries([...groups].map(([prefix, numbers]) => {
    const bytes = new Uint8Array(Math.ceil((Math.max(...numbers) + 1) / 8));
    for (const number of numbers) bytes[number >> 3] |= 1 << (number & 7);
    return [prefix, toBase64Url(bytes)];
  }));
  return { bits, loose };
}

export function decodeCardSet(encoded: { bits?: Record<string, string>; loose?: string[] }, width = 3) {
  const ids: string[] = [...(encoded.loose ?? [])];
  for (const [prefix, text] of Object.entries(encoded.bits ?? {})) {
    fromBase64Url(text).forEach((byte, index) => {
      for (let bit = 0; bit < 8; bit += 1) if (byte & (1 << bit)) ids.push(`${prefix}-${String(index * 8 + bit).padStart(width, "0")}`);
    });
  }
  return ids;
}

/** A copyable Dojo Record code: PFC1.<z|j>.<base64url payload>.<crc32>. */
export async function exportCode(state: CareerState) {
  const payload = JSON.stringify({
    v: state.schema, id: state.profileId, c: state.createdAt, r: state.packsRevision, s: state.rngSeed, n: state.packSerial,
    k: state.starterKits, o: encodeCardSet(state.opened), w: state.wallet, m: state.merit, l: state.claimedLevels,
    b: state.bonusRewards, st: state.streak, x: state.stats,
  });
  const bytes = new TextEncoder().encode(payload);
  const [mode, body] = canCompress() ? ["z", await pipeBytes(bytes, new CompressionStream("deflate-raw"))] : ["j", bytes];
  return `${CODE_PREFIX}.${mode}.${toBase64Url(body)}.${crc32(payload)}`;
}

const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/** Read a Dojo Record code. Throws with a player-readable message when the code is damaged. */
export async function parseCode(code: string): Promise<CareerState> {
  const [prefix, mode, body, checksum] = code.trim().replace(/\s+/g, "").split(".");
  if (prefix !== CODE_PREFIX || !body || !checksum || !["z", "j"].includes(mode)) throw new Error("That is not a Dojo Record code.");
  let payload: string;
  try {
    const bytes = fromBase64Url(body);
    payload = new TextDecoder().decode(mode === "z" ? await pipeBytes(bytes, new DecompressionStream("deflate-raw")) : bytes);
  } catch {
    throw new Error("The code is damaged. Copy it again in one piece.");
  }
  if (crc32(payload) !== checksum) throw new Error("The code failed its checksum. Copy it again in one piece.");
  const data = JSON.parse(payload) as Record<string, unknown>;
  if (asNumber(data.v) > CAREER_SCHEMA) throw new Error("This code comes from a newer version of Paper-Fu.");
  return normalizeState({
    schema: CAREER_SCHEMA, profileId: data.id, createdAt: data.c, packsRevision: data.r, rngSeed: data.s, packSerial: data.n,
    starterKits: data.k, opened: decodeCardSet((data.o ?? {}) as { bits?: Record<string, string>; loose?: string[] }), wallet: data.w,
    merit: data.m, claimedLevels: data.l, bonusRewards: data.b, streak: data.st, stats: data.x,
  });
}

/** Fill in defaults so a stored or imported record always has the full shape. */
export function normalizeState(raw: Record<string, unknown>): CareerState {
  const wallet = (raw.wallet && typeof raw.wallet === "object" ? raw.wallet : {}) as Record<string, unknown>;
  const streak = (raw.streak ?? {}) as Record<string, unknown>;
  const stats = (raw.stats ?? {}) as Record<string, unknown>;
  const byMode = (stats.byMode && typeof stats.byMode === "object" ? stats.byMode : {}) as Record<string, { wins?: number; losses?: number }>;
  return {
    schema: CAREER_SCHEMA,
    profileId: typeof raw.profileId === "string" && raw.profileId ? raw.profileId : "imported",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    packsRevision: typeof raw.packsRevision === "string" ? raw.packsRevision : economy.packs.packsRevision,
    rngSeed: asNumber(raw.rngSeed, 1) >>> 0 || 1,
    packSerial: Math.max(0, Math.floor(asNumber(raw.packSerial))),
    starterKits: asStrings(raw.starterKits),
    opened: [...new Set(asStrings(raw.opened))],
    packHistory: Array.isArray(raw.packHistory) ? (raw.packHistory as PackRecord[]) : [],
    wallet: Object.fromEntries(Object.entries(wallet).map(([currency, amount]) => [currency, Math.max(0, Math.floor(asNumber(amount)))])),
    merit: Math.max(0, Math.floor(asNumber(raw.merit))),
    claimedLevels: Array.isArray(raw.claimedLevels) ? raw.claimedLevels.filter((level): level is number => Number.isInteger(level)) : [],
    bonusRewards: Math.max(0, Math.floor(asNumber(raw.bonusRewards))),
    streak: { current: Math.max(0, asNumber(streak.current)), best: Math.max(0, asNumber(streak.best)), lastWinDay: typeof streak.lastWinDay === "string" ? streak.lastWinDay : null },
    stats: { wins: Math.max(0, asNumber(stats.wins)), losses: Math.max(0, asNumber(stats.losses)), byMode: Object.fromEntries(Object.entries(byMode).map(([mode, entry]) => [mode, { wins: asNumber(entry?.wins), losses: asNumber(entry?.losses) }])) },
    receipts: Array.isArray(raw.receipts) ? (raw.receipts as CareerState["receipts"]) : [],
    openDojo: raw.openDojo === true,
  };
}

// ---- The store ------------------------------------------------------------------------------

/**
 * What the pages see. "career": a working profile. "read-only": a newer schema is stored, so it is
 * shown and exportable but never written. "unavailable": this browser keeps no records (storage is
 * blocked), so the site falls back to Open Dojo. "everything": packs.json unlocks everything.
 */
export type CareerSnapshot = { status: "career" | "read-only" | "unavailable" | "everything"; state: CareerState | null; restoredFromBackup: boolean };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StoreOptions = { storage: () => StorageLike | null; now?: () => Date; random?: () => number };

const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function createCareerStore({ storage, now = () => new Date(), random = Math.random }: StoreOptions) {
  let snapshot: CareerSnapshot | null = null;
  const listeners = new Set<() => void>();

  const readRecord = (key: string): { state: CareerState | null; future: boolean } => {
    try {
      const text = storage()?.getItem(key);
      if (!text) return { state: null, future: false };
      const record = JSON.parse(text) as { checksum?: string; data?: Record<string, unknown> };
      if (!record?.data || record.checksum !== crc32(JSON.stringify(record.data))) return { state: null, future: false };
      if (asNumber(record.data.schema) > CAREER_SCHEMA) return { state: normalizeState(record.data), future: true };
      return { state: normalizeState(record.data), future: false };
    } catch {
      return { state: null, future: false };
    }
  };

  const writeRecord = (state: CareerState) => {
    try {
      const target = storage();
      if (!target) return false;
      const previous = target.getItem(CAREER_KEY);
      if (previous && readRecord(CAREER_KEY).state) target.setItem(CAREER_BACKUP_KEY, previous);
      target.setItem(CAREER_KEY, JSON.stringify({ checksum: crc32(JSON.stringify(state)), data: state }));
      return true;
    } catch {
      return false;
    }
  };

  const storageWorks = () => {
    try {
      const target = storage();
      if (!target) return false;
      target.setItem(`${CAREER_KEY}-probe`, "1");
      target.removeItem(`${CAREER_KEY}-probe`);
      return true;
    } catch {
      return false;
    }
  };

  function load(): CareerSnapshot {
    if (economy.unlockEverything) return { status: "everything", state: null, restoredFromBackup: false };
    const primary = readRecord(CAREER_KEY);
    if (primary.future) return { status: "read-only", state: primary.state, restoredFromBackup: false };
    if (primary.state) return { status: "career", state: economy.settle(primary.state).state, restoredFromBackup: false };
    if (!storageWorks()) return { status: "unavailable", state: null, restoredFromBackup: false };
    const hadPrimary = (() => { try { return Boolean(storage()?.getItem(CAREER_KEY)); } catch { return false; } })();
    const backup = readRecord(CAREER_BACKUP_KEY);
    if (hadPrimary && backup.state && !backup.future) {
      writeRecord(backup.state);
      return { status: "career", state: backup.state, restoredFromBackup: true };
    }
    const created = economy.newCareer({ profileId: Array.from({ length: 4 }, () => Math.floor(random() * 2 ** 32).toString(16).padStart(8, "0")).join(""), createdAt: now().toISOString(), rngSeed: Math.floor(random() * 2 ** 32) || 1 });
    writeRecord(created);
    return { status: "career", state: created, restoredFromBackup: false };
  }

  const notify = () => listeners.forEach((listener) => listener());

  function get(): CareerSnapshot {
    if (!snapshot) snapshot = load();
    return snapshot;
  }

  /** Apply a change to a working career, save it (write-ahead, before any animation) and tell subscribers. */
  function update(change: (state: CareerState) => CareerState) {
    const current = get();
    if (current.status !== "career" || !current.state) return current.state;
    const next = change(current.state);
    if (next === current.state) return next;
    writeRecord(next);
    snapshot = { status: "career", state: next, restoredFromBackup: false };
    notify();
    return next;
  }

  return {
    get,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Drop the cached snapshot (another tab wrote the record) and tell subscribers. */
    reload() { snapshot = null; notify(); },
    setOpenDojo(on: boolean) { return update((state) => (state.openDojo === on ? state : { ...state, openDojo: on })); },
    chooseStarterKit(kitId: string) { return update((state) => economy.chooseStarterKit(state, kitId)); },
    openBooster(seriesId: string) {
      let result: { cards: string[]; error: string | null } = { cards: [], error: get().status === "career" ? null : "no-career" };
      update((state) => {
        const opened = economy.openBooster(state, seriesId, now().toISOString());
        result = { cards: opened.cards, error: opened.error };
        return opened.error ? state : opened.state;
      });
      return result;
    },
    recordMatch(receipt: Omit<MatchReceipt, "day" | "at">): Payroll {
      const date = now();
      const current = get();
      if (current.status !== "career" || !current.state) return emptyPayroll(current.status === "everything" ? "unlock-everything" : "no-career");
      let payroll = emptyPayroll("no-career");
      update((state) => {
        const paid = economy.applyMatchResult(state, { ...receipt, day: localDay(date), at: date.toISOString() });
        payroll = paid.payroll;
        return paid.state;
      });
      return payroll;
    },
    async exportCode() { const state = get().state; return state ? exportCode(state) : null; },
    async importCode(code: string) {
      const imported = await parseCode(code);
      const before = get().state;
      const merged = update((state) => economy.mergeCareers(state, imported));
      return { before, after: merged };
    },
  };
}

export type CareerStore = ReturnType<typeof createCareerStore>;

function emptyPayroll(reason: Payroll["reason"]): Payroll {
  return { eligible: false, reason, lines: [], merit: 0, tickets: 0, stubs: 0, levelBefore: 0, levelAfter: 0, levels: [], stubsExchanged: 0, ticketsConverted: 0, meritFromTickets: 0, unlocked: { characters: [], bosses: [] } };
}

const browserStorage = () => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

/** The browser's career store. */
export const careerStore = createCareerStore({ storage: browserStorage });

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => { if (event.key === CAREER_KEY) careerStore.reload(); });
}

// ---- Questions the pages ask ----------------------------------------------------------------

/** True when the player is using their collection (not Open Dojo, not a record-less browser). */
export function collectionActive(snapshot: CareerSnapshot = careerStore.get()) {
  return snapshot.status !== "everything" && snapshot.status !== "unavailable" && Boolean(snapshot.state) && !snapshot.state!.openDojo;
}

/**
 * The card pool a new table plays with: the player's manifest (the shared-pool model, with one
 * human at the table), or null for the full catalog when Open Dojo is on or there is no career.
 */
export function tableCardPool(snapshot: CareerSnapshot = careerStore.get()): string[] | null {
  if (!collectionActive(snapshot)) return null;
  return economy.resolveMatchPool([economy.manifest(snapshot.state!)]);
}

/** Characters the player may choose, or null when every Character is available. */
export function playableCharacters(snapshot: CareerSnapshot = careerStore.get()): Set<string> | null {
  return collectionActive(snapshot) ? economy.unlockedRoster(snapshot.state!).characters : null;
}

/** Ticket count, with Ticket Stubs as the partial ticket. */
export function walletOf(state: CareerState | null) {
  return { tickets: state?.wallet[TICKET] ?? 0, stubs: state?.wallet[STUB] ?? 0, stubRate: economy.packs.earnRules.currencies.find((currency) => currency.id === STUB)?.exchangeRate ?? 3 };
}

/** A stable id for a match, so each match pays once even if its result is shown twice. */
export function matchIdFor(setup: { mode: string; seed: number; fighters: string[] }) {
  return `${setup.mode}:${setup.seed}:${setup.fighters.join("+")}`;
}
