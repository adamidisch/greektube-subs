import type { ReviewCue } from "./wqco-review-v2";
import { WQCO_REVIEW_VIDEO_ID, WQCO_REVIEW_V4_LEDGER, WQCO_REVIEW_V4_QUALITY } from "./wqco-review-v4";

export { WQCO_REVIEW_VIDEO_ID };

export type ReviewSpeaker = "dr_bright" | "jesse" | "mixed";
export type SpeakerConfidence = "high" | "medium" | "low";

export type V5CoverageRow = {
  sourceFrom: number;
  sourceTo: number;
  start: number;
  duration: number;
  text: string;
  speaker: ReviewSpeaker;
  speakerConfidence: SpeakerConfidence;
};

const TEXT_OVERRIDES: Record<number, string> = {
  4: "Τι είναι οι υδατάνθρακες; Στην ουσία είναι διεγερτικά και το θέμα είναι αν μπορείς να τους αντέξεις.",
  17: "Είναι κυρίως θέμα ποσότητας και λεπτομερειών: πόσο από αυτά θα φας.",
  64: "Η μύτη του έτρεχε κάθε μέρα της ζωής του. Έφτασε στα πενήντα του ως επιτυχημένος γιατρός χωρίς να καταλαβαίνει γιατί.",
  67: "Σταμάτησε να τρώει αυγά για μία εβδομάδα και η μύτη του σταμάτησε να τρέχει. Ένιωθε υπέροχα.",
  80: "Γι’ αυτό, λέει, τα τεστ ευαισθησίας σε τροφές δεν δείχνουν πάντα καθαρά τι σε ενοχλεί. Πρέπει πρώτα να αφαιρέσεις αυτές τις τροφές.",
  89: "Και πώς θα ήξερε πότε μπορούσε να ξαναδοκιμάσει αυγά; — Δεν ξέρω.",
  119: "Αν πριν έτρωγες υδατάνθρακες, το πίνεις έτσι. Και το ιώδιο; — Ναι, βέβαια.",
  140: "Προσπαθώ να καταλάβω το χρονοδιάγραμμα για κάποιον που δεν είναι μεταβολικά υγιής και είναι υπέρβαρος.",
  147: "Πόση βελτίωση έχει γίνει μέχρι τότε ώστε να μπορούν να ξαναβάλουν άλλα τρόφιμα; — Δεν ξέρω.",
  163: "Στην αρχή συνήθως φεύγει ο πόνος στις αρθρώσεις και μειώνεται η φλεγμονή. Είναι μια διατροφή που μειώνει τη φλεγμονή.",
  171: "Κάποια άλλα πράγματα χρειάζονται περισσότερο χρόνο για να ανακάμψουν, όπως τα επινεφρίδια και ο θυρεοειδής.",
  174: "Όμως έχεις ήδη μειώσει τη φλεγμονή, οπότε δίνεις στο σώμα καλύτερες συνθήκες για να συνεχίσει να αναρρώνει.",
  177: "Μετά μπορείς να καταλάβεις πιο εύκολα ποιες από τις τροφές που έτρωγες πριν σου προκαλούν φλεγμονή.",
  189: "Έχουμε επίσης διαφορετική επιβάρυνση από τοξίνες και διαφορετικές εμπειρίες ζωής.",
  191: "Δίνουμε ένα γενικό πλαίσιο, αλλά ο καθένας πρέπει να το προσαρμόζει στο δικό του σώμα.",
  200: "Ποια είναι λιγότερο πιθανό να προκαλέσουν αρνητική αντίδραση; — Κρόκος αυγού.",
};

const CLEAN_SPLITS = new Map<number, { splitAt: number; splitStart: number; leftText: string; rightText: string }>([
  [52, {
    splitAt: 55,
    splitStart: 141,
    leftText: "Ανέφερες μόνο πέντε ή έξι πράγματα. Μπορούμε να φάμε χοιρινό;",
    rightText: "Κοτόπουλο όχι, λόγω της υψηλής περιεκτικότητας σε ωμέγα-6.",
  }],
  [116, {
    splitAt: 117,
    splitStart: 297,
    leftText: "Και το αλάτι θα το βάλουμε κι αυτό;",
    rightText: "Ναι, πολύ αλάτι. Προτείνω μισό κουταλάκι σε ένα ποτήρι νερό.",
  }],
]);

function speakerForRange(sourceFrom: number, sourceTo: number): { speaker: ReviewSpeaker; speakerConfidence: SpeakerConfidence } {
  if (sourceTo <= 41) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 42 && sourceTo <= 46) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom >= 47 && sourceTo <= 48) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 49 && sourceTo <= 54) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom >= 55 && sourceTo <= 88) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 89 && sourceTo <= 91) return { speaker: "mixed", speakerConfidence: "low" };
  if (sourceFrom >= 92 && sourceTo <= 95) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 96 && sourceTo <= 98) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom === 99 || (sourceFrom < 100 && sourceTo >= 99)) return { speaker: "mixed", speakerConfidence: "low" };
  if (sourceFrom >= 100 && sourceTo <= 115) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom === 116 && sourceTo === 116) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom >= 117 && sourceTo <= 118) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 119 && sourceTo <= 120) return { speaker: "mixed", speakerConfidence: "low" };
  if (sourceFrom >= 121 && sourceTo <= 124) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom >= 125 && sourceTo <= 126) return { speaker: "mixed", speakerConfidence: "low" };
  if (sourceFrom >= 127 && sourceTo <= 135) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 136 && sourceTo <= 149) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom === 150 || (sourceFrom < 151 && sourceTo >= 150)) return { speaker: "mixed", speakerConfidence: "low" };
  if (sourceFrom >= 151 && sourceTo <= 185) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 186 && sourceTo <= 188) return { speaker: "mixed", speakerConfidence: "medium" };
  if (sourceFrom >= 189 && sourceTo <= 190) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 191 && sourceTo <= 200) return { speaker: "jesse", speakerConfidence: "medium" };
  if (sourceFrom === 201 || (sourceFrom < 202 && sourceTo >= 201)) return { speaker: "mixed", speakerConfidence: "low" };
  if (sourceFrom >= 202 && sourceTo <= 211) return { speaker: "dr_bright", speakerConfidence: "high" };
  if (sourceFrom >= 212 && sourceTo <= 215) return { speaker: "jesse", speakerConfidence: "high" };
  if (sourceFrom >= 216 && sourceTo <= 221) return { speaker: "dr_bright", speakerConfidence: "high" };
  return { speaker: "mixed", speakerConfidence: "low" };
}

const rows: V5CoverageRow[] = [];

for (const base of WQCO_REVIEW_V4_LEDGER) {
  const split = CLEAN_SPLITS.get(base.sourceFrom);
  if (split && split.splitAt <= base.sourceTo) {
    const leftMeta = speakerForRange(base.sourceFrom, split.splitAt - 1);
    const rightMeta = speakerForRange(split.splitAt, base.sourceTo);
    rows.push({
      sourceFrom: base.sourceFrom,
      sourceTo: split.splitAt - 1,
      start: base.start,
      duration: split.splitStart - base.start,
      text: split.leftText,
      ...leftMeta,
    });
    rows.push({
      sourceFrom: split.splitAt,
      sourceTo: base.sourceTo,
      start: split.splitStart,
      duration: base.start + base.duration - split.splitStart,
      text: split.rightText,
      ...rightMeta,
    });
    continue;
  }

  const meta = speakerForRange(base.sourceFrom, base.sourceTo);
  rows.push({
    ...base,
    text: TEXT_OVERRIDES[base.sourceFrom] ?? base.text,
    ...meta,
  });
}

export const WQCO_REVIEW_V5_LEDGER: V5CoverageRow[] = rows;
export const WQCO_REVIEW_V5_CUES: ReviewCue[] = rows.map(({ start, duration, text }) => ({ start, duration, text }));

const TERMINAL_PUNCTUATION = /[.!?;…»”]$/u;
const SPOKEN_FILLER = /(^|[\s,.!?;:—-])(?:ε|εε|uh|um)(?=$|[\s,.!?;:—-])/iu;
const ORPHAN_END = /(?:^|\s)(?:η|ο|το|τη|την|να|και|για|με|σε|από|που|ότι|θα|στο|στη|στην|τον|ένα|μια|ή)[.!?;…»”]?$/iu;
const OVER_MEDICAL = /\b(?:καταρροή|αρθραλγία|υπερευαισθησία|μεταβολικά μη υγι)\b/iu;

function validateV5() {
  let expectedSourceCue = 0;
  let observedMinDuration = Infinity;
  let maxDuration = 0;
  let maxCharsPerSecond = 0;
  let mixedSpeakerCueCount = 0;
  let highConfidenceSpeakerCueCount = 0;

  for (const row of rows) {
    if (row.sourceFrom !== expectedSourceCue) {
      throw new Error(`WQCO v5 unmapped source cue: expected ${expectedSourceCue}, got ${row.sourceFrom}`);
    }
    expectedSourceCue = row.sourceTo + 1;

    const text = row.text.replace(/\s+/g, " ").trim();
    const chars = text.replace(/\s/g, "").length;
    const cps = chars / row.duration;
    const requiredMinDuration = row.speakerConfidence === "high" && chars <= 34 ? 1.8 : 2.2;

    if (!Number.isFinite(row.duration) || row.duration < requiredMinDuration) {
      throw new Error(`WQCO v5 cue too short at ${row.start}: ${row.duration}s`);
    }
    if (row.duration > 12.5) throw new Error(`WQCO v5 cue too long at ${row.start}: ${row.duration}s`);
    if (!text || !TERMINAL_PUNCTUATION.test(text)) throw new Error(`WQCO v5 incomplete phrase at ${row.start}: ${text}`);
    if (SPOKEN_FILLER.test(text)) throw new Error(`WQCO v5 filler leaked into Greek display at ${row.start}`);
    if (ORPHAN_END.test(text)) throw new Error(`WQCO v5 orphan word at ${row.start}: ${text}`);
    if (OVER_MEDICAL.test(text)) throw new Error(`WQCO v5 avoidable medicalese at ${row.start}: ${text}`);
    if (cps > 20) throw new Error(`WQCO v5 reading speed too high at ${row.start}: ${cps.toFixed(1)} cps`);

    if (row.speaker === "mixed") mixedSpeakerCueCount += 1;
    if (row.speakerConfidence === "high") highConfidenceSpeakerCueCount += 1;
    observedMinDuration = Math.min(observedMinDuration, row.duration);
    maxDuration = Math.max(maxDuration, row.duration);
    maxCharsPerSecond = Math.max(maxCharsPerSecond, cps);
  }

  if (expectedSourceCue !== WQCO_REVIEW_V4_QUALITY.sourceCueCount) {
    throw new Error(`WQCO v5 source coverage incomplete: ${expectedSourceCue}/${WQCO_REVIEW_V4_QUALITY.sourceCueCount}`);
  }

  return {
    sourceCueCount: WQCO_REVIEW_V4_QUALITY.sourceCueCount,
    coveredSourceCueCount: expectedSourceCue,
    coveragePercent: 100,
    displayCueCount: rows.length,
    mixedSpeakerCueCount,
    highConfidenceSpeakerCueCount,
    minDuration: Number(observedMinDuration.toFixed(2)),
    maxDuration: Number(maxDuration.toFixed(2)),
    maxCharsPerSecond: Number(maxCharsPerSecond.toFixed(1)),
    plainMedicalGreek: true,
    speakerAware: true,
    speakerMethod: "transcript_turn_inference_no_audio_diarization",
  };
}

export const WQCO_REVIEW_V5_QUALITY = validateV5();
