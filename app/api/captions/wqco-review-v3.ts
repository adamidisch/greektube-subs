import { WQCO_REVIEW_VIDEO_ID, WQCO_REVIEW_V2_CUES, type ReviewCue } from "./wqco-review-v2";

export { WQCO_REVIEW_VIDEO_ID };

const TEXT_OVERRIDES: Record<number, string> = {
  48: "Δεν τρώω έτσι αποκλειστικά. Πρόσφατα ήμουν στη Γλασκώβη.",
  53: "Εκεί προσέχαμε τον εγγονό μου και φάγαμε scone με βούτυρο και μαρμελάδα.",
  60: "Θέλαμε απλώς να το δοκιμάσουμε. Δεν χρειάζεται να τρως έτσι συνέχεια.",
  178: "Αργότερα η γυναίκα του τού έφτιαξε ένα κέικ.",
  183: "Δεν ήξερε ότι είχε αυγά. Έφαγε ένα κομμάτι και έπαθε σοκ.",
  295: "Προτείνω πολύ αλάτι, ακόμη και μισό κουταλάκι σε ένα ποτήρι νερό.",
  301: "Αυτό βοηθά αν πριν έτρωγες υδατάνθρακες. Και ιώδιο; — Ναι.",
  308: "Ανέφερες και ντεκαφεϊνέ καφέ. Μήπως είναι καλύτερα να τον κόψουμε αρχικά;",
  314: "Έτσι θα αφαιρούσαμε κι αυτή τη μεταβλητή. — Μερικοί το κάνουν και άλλοι όχι.",
  333: "Έτσι η μετάβαση γίνεται ευκολότερη. Άλλοι ζεσταίνουν βούτυρο σε νερό.",
  339: "Και αυτό τους αρέσει. Τι γίνεται μετά από δύο εβδομάδες αυστηρού αποκλεισμού;",
  346: "Έχει ήδη γίνει αρκετή επούλωση ώστε να αρχίσουν να επανεισάγουν τροφές;",
  392: "Ακόμη και τη δεκαετία του ’40, η διατροφή είχε πολύ περισσότερο λίπος.",
  398: "Είχε επίσης πολύ περισσότερο κρέας. Το διατροφικό διάγραμμα ήταν πολύ διαφορετικό.",
  404: "Άρα η δυσκολία είναι κυρίως χαρακτηριστικό της σύγχρονης διατροφής.",
  409: "Αυτό αφορά κυρίως ορισμένες κοινωνίες και περιοχές.",
  419: "Είναι αντιφλεγμονώδης διατροφή και μπορεί να χάσεις λίγο βάρος.",
  424: "Δεν θα χάσεις απαραίτητα όλο το βάρος που θέλεις. Κάποια πράγματα χρειάζονται χρόνο.",
  442: "Μετά ξεχωρίζεις πιο καθαρά ποιες από τις προηγούμενες τροφές σε ενοχλούν.",
  447: "Δεν έχουν όλοι πρόβλημα με το ασπράδι ή τον κρόκο του αυγού.",
  465: "Το βασικό είναι να δοκιμάζουμε, γιατί όλοι έχουμε διαφορετικά γονίδια.",
  471: "Έχουμε επίσης διαφορετική τοξική επιβάρυνση και διαφορετικές εμπειρίες ζωής.",
};

const SOURCE_ANCHORS = new Set(WQCO_REVIEW_V2_CUES.map(cue => cue.start));
const TERMINAL_PUNCTUATION = /[.!?;…»”]$/u;
const SPOKEN_FILLER = /(^|[\s,.!?;:—-])(?:ε|εε|uh|um)(?=$|[\s,.!?;:—-])/iu;
const ORPHAN_END = /(?:^|\s)(?:η|ο|το|τη|την|να|και|για|με|σε|από|που|ότι|θα|στο|στη|στην|τον|ένα|μια|ή)[.!?;…»”]?$/iu;

export type ReviewQuality = {
  cueCount: number;
  minDuration: number;
  maxCharsPerSecond: number;
  maxDuration: number;
};

export const WQCO_REVIEW_V3_CUES: ReviewCue[] = WQCO_REVIEW_V2_CUES.map(cue => ({
  ...cue,
  text: TEXT_OVERRIDES[cue.start] ?? cue.text,
}));

function validateReviewV3(cues: ReviewCue[]): ReviewQuality {
  let previousEnd = -Infinity;
  let minDuration = Infinity;
  let maxDuration = 0;
  let maxCharsPerSecond = 0;

  for (const cue of cues) {
    const text = cue.text.replace(/\s+/g, " ").trim();
    const chars = text.replace(/\s/g, "").length;
    const cps = chars / cue.duration;

    if (!SOURCE_ANCHORS.has(cue.start)) throw new Error(`WQCO v3 start is not a verified source anchor: ${cue.start}`);
    if (!Number.isFinite(cue.duration) || cue.duration < 2.2) throw new Error(`WQCO v3 cue is too short at ${cue.start}: ${cue.duration}s`);
    if (cue.duration > 7.5) throw new Error(`WQCO v3 cue is too long at ${cue.start}: ${cue.duration}s`);
    if (cue.start < previousEnd - 0.001) throw new Error(`WQCO v3 overlap at ${cue.start}`);
    if (!text || !TERMINAL_PUNCTUATION.test(text)) throw new Error(`WQCO v3 incomplete phrase at ${cue.start}: ${text}`);
    if (SPOKEN_FILLER.test(text)) throw new Error(`WQCO v3 filler leaked into Greek display at ${cue.start}: ${text}`);
    if (ORPHAN_END.test(text)) throw new Error(`WQCO v3 orphan word at ${cue.start}: ${text}`);
    if (cps > 20) throw new Error(`WQCO v3 reading speed too high at ${cue.start}: ${cps.toFixed(1)} cps`);

    previousEnd = cue.start + cue.duration;
    minDuration = Math.min(minDuration, cue.duration);
    maxDuration = Math.max(maxDuration, cue.duration);
    maxCharsPerSecond = Math.max(maxCharsPerSecond, cps);
  }

  return {
    cueCount: cues.length,
    minDuration: Number(minDuration.toFixed(2)),
    maxDuration: Number(maxDuration.toFixed(2)),
    maxCharsPerSecond: Number(maxCharsPerSecond.toFixed(1)),
  };
}

export const WQCO_REVIEW_V3_QUALITY = validateReviewV3(WQCO_REVIEW_V3_CUES);
