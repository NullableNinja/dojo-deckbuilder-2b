// The sixteen numbered rulebook chapters as the website presents them (from app/data/rules.json).
import { CANONICAL_RULES } from "./canonical-presentation";

export type RuleBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "table"; rows: (string | number)[][] };
export type RuleSection = { id: string; title: string; content: RuleBlock[] };
export type RuleChapter = { id: string; number: number; title: string; intro: RuleBlock[]; sections: RuleSection[] };

export const RULE_CHAPTERS = (CANONICAL_RULES as unknown as { chapters: RuleChapter[] }).chapters.filter((chapter) => chapter.number >= 1 && chapter.number <= 16);

export const chapterNumber = (chapter: RuleChapter) => String(RULE_CHAPTERS.findIndex((entry) => entry.id === chapter.id) + 1).padStart(2, "0");
export const blockText = (block: RuleBlock) => block.kind === "table" ? block.rows.flat().map(String).join(" · ") : block.text;
export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
