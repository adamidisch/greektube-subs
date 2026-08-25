export const ALIGNMENT_PROOF_QUERY_VALUE = "alignment-v1";
export const ALIGNMENT_PROOF_VIDEO_ID = "D2RjneeG_xA";

export function isAlignmentProofRequest(search: string) {
  const params = new URLSearchParams(search);
  return params.get("proof") === ALIGNMENT_PROOF_QUERY_VALUE
    && params.get("video") === ALIGNMENT_PROOF_VIDEO_ID;
}

export const ALIGNMENT_PROOF_CAPTIONS = {
  videoId: ALIGNMENT_PROOF_VIDEO_ID,
  title: "Ο ευκολότερος τρόπος αντιστροφής μεταβολικών προβλημάτων",
  originalTitle: "#1 Absolute Easiest Way to Reverse Metabolic Issues",
  channel: "Συζήτηση υγείας",
  duration: 565.56,
  transcriptVersion: 12,
  cues: [
    { start: 0.080, duration: 2.997, text: "Κάποιος που παρακολουθεί μέχρι αυτό το σημείο" },
    { start: 3.077, duration: 2.997, text: "πιθανότατα ανήκει στην κατηγορία της μεταβολικής δυσλειτουργίας." },
    { start: 6.074, duration: 2.738, text: "Έχει λίγα παραπανίσια κιλά να χάσει" },
    { start: 8.812, duration: 3.268, text: "αλλά έχει εμπνευστεί και είναι έτοιμος να αναλάβει δράση." },
    { start: 12.080, duration: 4.254, text: "Αν πρόκειται να εφαρμόσει πολλά από όσα συζητήσαμε σήμερα," },
    { start: 16.334, duration: 1.309, text: "τι προτείνετε;" },
    { start: 17.643, duration: 1.636, text: "Να τα ξεκινήσει όλα απότομα" },
    { start: 19.279, duration: 1.344, text: "και να τα κάνει όλα μαζί" },
    { start: 20.623, duration: 3.137, text: "ή να προχωρήσει πιο αργά," },
    { start: 23.760, duration: 2.240, text: "δίνοντας χρόνο στο σώμα του να προσαρμοστεί;" },
    { start: 26.000, duration: 2.100, text: "Εξαρτάται από το πόσο άρρωστος είσαι." },
    { start: 28.100, duration: 2.700, text: "Βλέπω ανθρώπους με σύνδρομα κόπωσης" },
    { start: 30.800, duration: 2.400, text: "και ορισμένοι είναι πολύ άρρωστοι." },
    { start: 33.200, duration: 3.397, text: "Όταν εφαρμόζονται αυτές οι παρεμβάσεις" },
    { start: 36.597, duration: 1.942, text: "εμφανίζονται αντιδράσεις αποτοξίνωσης," },
    { start: 38.539, duration: 1.941, text: "κετογονική υπογλυκαιμία" },
    { start: 40.480, duration: 2.960, text: "και η λεγόμενη «κετογονική γρίπη»." },
    { start: 43.440, duration: 2.194, text: "Μερικές φορές, αν έχεις αλλεργία σε κάποια τροφή," },
    { start: 45.634, duration: 3.953, text: "η αλλεργία και η εξάρτηση είναι δύο όψεις του ίδιου νομίσματος." },
    { start: 49.587, duration: 1.933, text: "Μπορεί να εμφανιστούν συμπτώματα στέρησης." },
    { start: 51.520, duration: 514.040, text: "" },
  ],
  keyPoints: [
    "Δοκιμή semantic alignment με πραγματικά source timing anchors.",
    "Το δοκιμαστικό τμήμα καλύπτει τα πρώτα 52 δευτερόλεπτα.",
  ],
};
