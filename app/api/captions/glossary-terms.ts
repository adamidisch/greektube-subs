import type { TranslationGlossaryEntry } from "./translation-understanding.ts";

/**
 * Owner-approved equivalent Greek renderings (Platform Foundation — Global Rules,
 * "Subtitle Terminology"). Every rendering in `greek` is correct; translators alternate
 * them so viewers who know either term are covered. Add new pairs here only on owner approval.
 */
export const APPROVED_TERM_EQUIVALENTS: { source: string[]; greek: string[]; note: string }[] = [
  {
    source: ["underactive thyroid", "hypothyroidism", "hypothyroid"],
    greek: ["υποθυρεοειδισμός", "υπολειτουργικός θυρεοειδής"],
    note: "Approved equivalents: use the shorter when space is tight, the fuller at first mention when it fits.",
  },
];

/** Glossary renderings longer than this many words are explanatory, not terms, and are not enforced. */
const MAX_ENFORCED_WORDS = 3;

const lowerSource = (text: string) => text.toLowerCase().replace(/\s+/gu, " ").trim();

function greekFold(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/ς/gu, "σ");
}

/** Strips inflectional endings so case/number forms match (θυρεοειδής ~ θυρεοειδούς). */
function greekStem(word: string) {
  const folded = greekFold(word);
  const stem = folded.replace(/[αεηιουωσ]+$/u, "");
  return stem.length >= 4 ? stem : folded;
}

function greekTokens(text: string) {
  return (greekFold(text).match(/[\p{L}]+/gu) || []);
}

export function acceptedRenderings(entry: TranslationGlossaryEntry): string[] {
  return [entry.greek, ...(entry.alternates || [])].map(r => r.trim()).filter(Boolean);
}

/** Adds owner-approved alternates to matching entries and appends missing approved terms. */
export function withApprovedEquivalents(glossary: TranslationGlossaryEntry[]): TranslationGlossaryEntry[] {
  const result = glossary.map(entry => ({ ...entry, ...(entry.alternates ? { alternates: [...entry.alternates] } : {}) }));
  for (const approved of APPROVED_TERM_EQUIVALENTS) {
    const sources = approved.source.map(lowerSource);
    const matching = result.filter(entry => sources.includes(lowerSource(entry.source)));
    if (matching.length) {
      for (const entry of matching) {
        entry.greek = approved.greek[0];
        entry.alternates = approved.greek.slice(1);
        entry.note = approved.note;
      }
    }
    for (const source of approved.source) {
      if (result.some(entry => lowerSource(entry.source) === lowerSource(source))) continue;
      result.push({ source, greek: approved.greek[0], alternates: approved.greek.slice(1), note: approved.note });
    }
  }
  return result;
}

function sourceMentions(sourceText: string, term: string) {
  const escaped = lowerSource(term).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/ /gu, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:s|es)?(?![\\p{L}\\p{N}])`, "iu").test(sourceText);
}

function renderingPresent(greekText: string, rendering: string) {
  const tokens = greekTokens(greekText);
  const stems = greekTokens(rendering).filter(word => word.length >= 3).map(greekStem);
  return stems.length > 0 && stems.every(stem => tokens.some(token => token.startsWith(stem)));
}

export type GlossaryViolation = { source: string; accepted: string[] };

/**
 * Deterministic glossary gate: every enforced term mentioned in the English must appear in the
 * Greek as one of its approved renderings (any inflection). Overlapping source terms
 * (e.g. "hypothyroid" inside "hypothyroidism") are satisfied by the same Greek rendering.
 */
export function glossaryViolations(sourceText: string, greekText: string, glossary: TranslationGlossaryEntry[]): GlossaryViolation[] {
  const violations: GlossaryViolation[] = [];
  for (const entry of glossary) {
    const accepted = acceptedRenderings(entry);
    if (!accepted.length || accepted.some(r => r.split(/\s+/u).length > MAX_ENFORCED_WORDS)) continue;
    if (!sourceMentions(sourceText, entry.source)) continue;
    if (!accepted.some(rendering => renderingPresent(greekText, rendering))) violations.push({ source: entry.source, accepted });
  }
  return violations;
}
