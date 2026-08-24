import type { ReviewCue } from "./wqco-review-v2";

export const WQCO_REVIEW_VIDEO_ID = "WQCO8wlldAQ";
const SOURCE_CUE_COUNT = 222;
const SOURCE_END = 550;
const SOURCE_STARTS = [0, 2, 5, 7, 10, 12, 17, 20, 21, 24, 26, 27, 31, 34, 37, 38, 41, 43, 46, 48, 51, 53, 56, 60, 62, 65, 67, 69, 73, 76, 77, 79, 81, 83, 86, 87, 90, 92, 97, 100, 103, 106, 108, 110, 113, 115, 118, 121, 125, 128, 130, 133, 135, 137, 139, 141, 144, 146, 149, 151, 153, 157, 159, 162, 164, 167, 169, 171, 174, 178, 180, 183, 186, 188, 190, 193, 195, 196, 200, 203, 206, 208, 210, 212, 215, 219, 223, 225, 226, 229, 231, 234, 236, 238, 241, 243, 246, 248, 250, 254, 257, 259, 261, 264, 267, 269, 272, 274, 276, 280, 281, 285, 286, 288, 291, 293, 295, 297, 300, 301, 305, 308, 310, 311, 314, 317, 320, 321, 323, 325, 327, 330, 333, 336, 338, 339, 343, 346, 349, 350, 353, 355, 357, 359, 362, 364, 366, 367, 370, 372, 374, 376, 378, 381, 385, 388, 390, 392, 396, 398, 401, 404, 409, 413, 415, 417, 419, 421, 423, 424, 427, 428, 430, 433, 436, 439, 442, 444, 447, 450, 452, 453, 455, 457, 460, 461, 465, 468, 471, 473, 475, 477, 480, 483, 485, 488, 491, 494, 496, 498, 500, 503, 507, 508, 510, 512, 515, 517, 518, 521, 523, 525, 527, 530, 531, 533, 535, 537, 539, 541, 543, 546] as const;

type V4Block = {
  sourceFrom: number;
  sourceTo: number;
  text: string;
};

export type V4CoverageRow = V4Block & {
  start: number;
  duration: number;
};

const V4_BLOCKS: V4Block[] = [
  { sourceFrom: 0, sourceTo: 1, text: "Το πρωτόκολλό μου είναι ουσιαστικά δύο εβδομάδες περιορισμού." },
  { sourceFrom: 2, sourceTo: 3, text: "Μετά προσθέτεις ξανά τα υπόλοιπα ζωικά τρόφιμα και βλέπεις τι μπορείς να ανεχτείς." },
  { sourceFrom: 4, sourceTo: 5, text: "Τι είναι οι υδατάνθρακες; Στην ουσία είναι διεγερτικά και κάποιοι μπορούν να τους διαχειριστούν." },
  { sourceFrom: 6, sourceTo: 7, text: "Αν επιστρέψεις στη γλυκόλυση, τότε πρέπει να μιλήσουμε για την κέτωση." },
  { sourceFrom: 8, sourceTo: 9, text: "Πιστεύω πραγματικά ότι το να βρίσκεσαι σε κέτωση είναι ο καλύτερος τρόπος." },
  { sourceFrom: 10, sourceTo: 12, text: "Η μητέρα μου είχε Αλτσχάιμερ και δεν θέλω να το πάθω. Γι’ αυτό τρώω έτσι, ώστε να διασφαλίσω ότι δεν θα έχω νευρολογικά προβλήματα." },
  { sourceFrom: 13, sourceTo: 14, text: "Ένα παγωτό κάθε δύο εβδομάδες δεν σημαίνει ότι θα πάθω Αλτσχάιμερ." },
  { sourceFrom: 15, sourceTo: 16, text: "Οκτώ ώρες αργότερα θα είμαι ξανά σε κέτωση." },
  { sourceFrom: 17, sourceTo: 18, text: "Είναι περισσότερο θέμα αποχρώσεων και ποσότητας: πόσο από αυτά θα φας." },
  { sourceFrom: 19, sourceTo: 20, text: "Δεν τρώω αποκλειστικά έτσι. Πρόσφατα ήμουν στη Γλασκώβη." },
  { sourceFrom: 21, sourceTo: 22, text: "Εκεί προσέχαμε τον εγγονό μου για έναν μήνα και φάγαμε scone με βούτυρο και μαρμελάδα." },
  { sourceFrom: 23, sourceTo: 25, text: "Ήμασταν στη Γλασκώβη και θέλαμε να το δοκιμάσουμε. Δεν χρειάζεται να τρως έτσι συνέχεια." },
  { sourceFrom: 26, sourceTo: 27, text: "Εγώ αυτή τη στιγμή δεν προσπαθώ να διορθώσω κάποιο συγκεκριμένο πρόβλημα." },
  { sourceFrom: 28, sourceTo: 29, text: "Το μαρούλι, για παράδειγμα, δεν έχει σχεδόν τίποτα: κυρίως χλωροφύλλη και νερό." },
  { sourceFrom: 30, sourceTo: 32, text: "Δεν πρόκειται να σε βλάψει. Υπάρχουν όμως πολλά φυτά που μπορούν να σε ενοχλήσουν, ειδικά αν προσπαθείς να θεραπευτείς." },
  { sourceFrom: 33, sourceTo: 36, text: "Γιατί να μη θεραπευτείς πρώτα; Αφαίρεσε πολλά από αυτά. Πάρα πολλοί αισθάνονται καλύτερα όταν τα περιορίζουν." },
  { sourceFrom: 37, sourceTo: 39, text: "Όταν φτάσεις εκεί που θέλεις, πρόσθεσε ένα λιγότερο ιδανικό τρόφιμο κάθε τέσσερις μέρες και δες αν μπαίνει στη λίστα με τα «όχι»." },
  { sourceFrom: 40, sourceTo: 41, text: "Το ανοσοποιητικό σου μπορεί να σου δείξει καθαρά: «Αυτό δεν μου ταιριάζει αυτή τη στιγμή»." },
  { sourceFrom: 42, sourceTo: 44, text: "Ανέφερες ότι ξεκινάμε με δύο εβδομάδες και μετά επανεισάγουμε σταδιακά τρόφιμα." },
  { sourceFrom: 45, sourceTo: 46, text: "Τι ακριβώς περιλαμβάνει αυτή η αρχική φάση, όταν η διατροφή είναι στην πιο αυστηρή της μορφή;" },
  { sourceFrom: 47, sourceTo: 48, text: "Για δύο εβδομάδες πλήρους αποκλεισμού: μοσχάρι, αρνί, βούτυρο ή tallow, ντεκαφεϊνέ καφέ και νερό. Αυτό είναι όλο." },
  { sourceFrom: 49, sourceTo: 51, text: "Δηλαδή ούτε κοτόπουλο; Είναι τόσο αυστηρό ώστε να θέλουμε μόνο μηρυκαστικά;" },
  { sourceFrom: 52, sourceTo: 55, text: "Ανέφερες μόνο πέντε ή έξι πράγματα. Μπορούμε να φάμε χοιρινό; Κοτόπουλο όχι, λόγω της υψηλής περιεκτικότητας σε ωμέγα-6." },
  { sourceFrom: 56, sourceTo: 58, text: "Αν θέλεις να βοηθήσεις το ανοσοποιητικό σου, υπάρχει μια ιστορία από τον Dr. Mackarness, έναν Βρετανό γιατρό." },
  { sourceFrom: 59, sourceTo: 60, text: "Μιλούσε για έναν Αμερικανό γιατρό που σπούδασε στο Harvard Medical School." },
  { sourceFrom: 61, sourceTo: 63, text: "Ο πατέρας του είχε φάρμα με αυγά. Δεν είχε πολλά χρήματα, οπότε έτρωγε αυγά κάθε μέρα." },
  { sourceFrom: 64, sourceTo: 66, text: "Παράλληλα είχε καταρροή κάθε μέρα της ζωής του. Έφτασε στα πενήντα του ως επιτυχημένος γιατρός χωρίς να καταλαβαίνει γιατί." },
  { sourceFrom: 67, sourceTo: 68, text: "Μια εβδομάδα σταμάτησε να τρώει αυγά και η καταρροή εξαφανίστηκε. Ένιωθε καταπληκτικά." },
  { sourceFrom: 69, sourceTo: 70, text: "Δεν κατάλαβε ποτέ ακριβώς γιατί, αλλά αισθανόταν πολύ καλύτερα. Μετά η γυναίκα του τού έφτιαξε ένα κέικ." },
  { sourceFrom: 71, sourceTo: 72, text: "Δεν ήξερε ότι το κέικ είχε αυγά. Έφαγε ένα κομμάτι." },
  { sourceFrom: 73, sourceTo: 74, text: "Τότε έπαθε σοκ. Το ανοσοποιητικό του προσπαθούσε όλη του τη ζωή να του δείξει ότι τα αυγά του προκαλούσαν φλεγμονή." },
  { sourceFrom: 75, sourceTo: 77, text: "Πιθανότατα έφταιγε το ασπράδι ή ίσως η τροφή των πουλερικών, αφού έτρωγαν σιτηρά και τα αυγά είχαν περισσότερο ωμέγα-6." },
  { sourceFrom: 78, sourceTo: 79, text: "Όταν ξαναέφαγε αυγό αφού το είχε αφαιρέσει για κάποιο διάστημα, η αντίδραση ήταν πολύ έντονη." },
  { sourceFrom: 80, sourceTo: 82, text: "Γι’ αυτό, λέει, τα τεστ τροφικής ευαισθησίας δεν λειτουργούν πάντα. Πρέπει πρώτα να αφαιρέσεις αυτά τα τρόφιμα." },
  { sourceFrom: 83, sourceTo: 84, text: "Το ανοσοποιητικό πρέπει να είναι αρκετά δυνατό ώστε να πει ξεκάθαρα: «Αυτό το βλέπω ως απειλή»." },
  { sourceFrom: 85, sourceTo: 87, text: "Όταν έπαθε σοκ, το σύστημά του βρισκόταν ήδη σε καλύτερη φάση επούλωσης." },
  { sourceFrom: 88, sourceTo: 88, text: "Πριν ήταν πιο αποδυναμωμένο και στη συνέχεια είχε ξαναδυναμώσει." },
  { sourceFrom: 89, sourceTo: 91, text: "Και πώς θα ήξερε πότε μπορούσε να ξαναδοκιμάσει αυγά; Δεν ξέρω." },
  { sourceFrom: 92, sourceTo: 95, text: "Μέχρι εκεί φτάνει η ιστορία. Αυτή ήταν η εξήγηση του Mackarness για αυτό που αποκαλούσε «δίαιτα της Λίθινης Εποχής» τη δεκαετία του πενήντα." },
  { sourceFrom: 96, sourceTo: 98, text: "Ας ξαναδούμε τη σύντομη λίστα. Αν ήμουν νέος ασθενής σου, θα ήθελα δύο εβδομάδες πλήρους αποκλεισμού." },
  { sourceFrom: 99, sourceTo: 102, text: "Τι θα μπορούσα να φάω; Αρνί, οποιοδήποτε μοσχάρι, συκώτι και short ribs. Εγώ προτιμώ μπριζόλα." },
  { sourceFrom: 103, sourceTo: 104, text: "Στον κιμά η πρωτεΐνη αλλοιώνεται ελαφρά, επειδή η λεπίδα ζεσταίνει το κρέας καθώς αλέθεται." },
  { sourceFrom: 105, sourceTo: 106, text: "Έτσι αλλάζουν λίγο τα μόρια της πρωτεΐνης." },
  { sourceFrom: 107, sourceTo: 109, text: "Μιλάω βέβαια για ανθρώπους που είναι εξαιρετικά ευαίσθητοι. Για δύο εβδομάδες: μπριζόλα και αρνί." },
  { sourceFrom: 110, sourceTo: 112, text: "Παϊδάκια, ribeye, οποιαδήποτε μπριζόλα, αρκεί να είναι μοσχάρι. Δεν χρειάζεται να είναι grass-fed." },
  { sourceFrom: 113, sourceTo: 115, text: "Θέλουμε επίσης αρκετό λίπος, είτε βούτυρο είτε tallow, και φυσικά αλάτι." },
  { sourceFrom: 116, sourceTo: 118, text: "Ναι, πολύ αλάτι. Προτείνω μισό κουταλάκι αλάτι σε ένα ποτήρι νερό." },
  { sourceFrom: 119, sourceTo: 120, text: "Αν πριν έτρωγες υδατάνθρακες, το πίνεις έτσι. Και ιώδιο; Ναι, και ιώδιο." },
  { sourceFrom: 121, sourceTo: 123, text: "Ανέφερες και ντεκαφεϊνέ καφέ. Μήπως θα ήταν καλύτερα να τον κόψουμε στην αρχή;" },
  { sourceFrom: 124, sourceTo: 126, text: "Έτσι αφαιρούμε κι αυτή τη μεταβλητή. Μερικοί το κάνουν και άλλοι όχι." },
  { sourceFrom: 127, sourceTo: 129, text: "Εγώ απλώς πίνω ντεκαφεϊνέ, δεν είναι απαραίτητος." },
  { sourceFrom: 130, sourceTo: 132, text: "Πολλοί έρχονται από καφέ με καφεΐνη ή τσάι, που το θεωρώ πολύ κακή επιλογή λόγω της περιεκτικότητας σε φθόριο. Έτσι η μετάβαση γίνεται ευκολότερη." },
  { sourceFrom: 133, sourceTo: 135, text: "Μερικοί απλώς ζεσταίνουν βούτυρο σε ζεστό νερό και τους αρέσει." },
  { sourceFrom: 136, sourceTo: 139, text: "Μετά από δύο εβδομάδες αυτής της «ακραίας» φάσης αποκλεισμού, έχει ήδη γίνει σημαντική επούλωση ώστε να μπορούν να αρχίσουν επανεισαγωγές;" },
  { sourceFrom: 140, sourceTo: 142, text: "Προσπαθώ να καταλάβω το χρονοδιάγραμμα για κάποιον μεταβολικά μη υγιή και υπέρβαρο." },
  { sourceFrom: 143, sourceTo: 146, text: "Δύο εβδομάδες είναι μεγάλη αλλαγή και για πολλούς οργανισμούς θα είναι σοκ, επειδή διαφέρει ριζικά από ό,τι έτρωγαν." },
  { sourceFrom: 147, sourceTo: 150, text: "Πόση επούλωση έχει γίνει μέχρι τότε ώστε να μπορούν να ξαναβάλουν άλλα τρόφιμα; Δεν ξέρω." },
  { sourceFrom: 151, sourceTo: 153, text: "Είσαι στην Αμερική. Δεν νομίζω ότι οι άνθρωποι εξελιχθήκαμε για να τρώμε αυτή την ποσότητα και ποικιλία τροφών." },
  { sourceFrom: 154, sourceTo: 156, text: "Οι περισσότερες άλλες κοινωνίες δεν τρώνε Pringles και όλα αυτά τα προϊόντα που έχουμε εφεύρει." },
  { sourceFrom: 157, sourceTo: 160, text: "Ακόμη και τη δεκαετία του σαράντα, το διάγραμμα διατροφής είχε πολύ περισσότερο λίπος και πολύ περισσότερο κρέας, σε πολύ πιο ισορροπημένες αναλογίες." },
  { sourceFrom: 161, sourceTo: 162, text: "Άρα αυτή η δυσκολία αφορά κυρίως τη σύγχρονη κοινωνία και ορισμένες περιοχές όπου η σημερινή διατροφή είναι πολύ διαφορετική." },
  { sourceFrom: 163, sourceTo: 166, text: "Στην αρχή της επούλωσης συνήθως υποχωρεί ο πόνος στις αρθρώσεις και μειώνεται η φλεγμονή. Είναι μια αντιφλεγμονώδης διατροφή." },
  { sourceFrom: 167, sourceTo: 170, text: "Μπορεί να χάσεις λίγο βάρος, αλλά όχι απαραίτητα όλο το βάρος που θέλεις." },
  { sourceFrom: 171, sourceTo: 173, text: "Υπάρχουν κι άλλοι παράγοντες που χρειάζονται περισσότερο χρόνο για να επουλωθούν, όπως τα επινεφρίδια και ο θυρεοειδής." },
  { sourceFrom: 174, sourceTo: 176, text: "Έχεις όμως αφαιρέσει τη φλεγμονή, δίνοντας στο σώμα ένα σημαντικό βήμα προς τα πάνω στη διαδικασία επούλωσης." },
  { sourceFrom: 177, sourceTo: 180, text: "Μετά μπορείς να δεις πολύ πιο εύκολα και καθαρά ποιες τροφές που έτρωγες πριν σου προκαλούν φλεγμονή." },
  { sourceFrom: 181, sourceTo: 183, text: "Δεν έχουν όλοι πρόβλημα με το ασπράδι ή τον κρόκο του αυγού. Πολλοί δεν έχουν πρόβλημα ούτε με το κοτόπουλο." },
  { sourceFrom: 184, sourceTo: 185, text: "Μερικοί όμως ενοχλούνται από την πέτσα του κοτόπουλου. Έτσι φαίνεται πόσο διαφορετικός είναι ο καθένας." },
  { sourceFrom: 186, sourceTo: 188, text: "Είμαστε όλοι πολύ διαφορετικοί, γι’ αυτό πρέπει να δοκιμάζουμε. Έχουμε διαφορετικά γονίδια." },
  { sourceFrom: 189, sourceTo: 190, text: "Έχουμε επίσης διαφορετική τοξική επιβάρυνση και διαφορετικές εμπειρίες ζωής." },
  { sourceFrom: 191, sourceTo: 194, text: "Προσπαθούμε να δώσουμε ένα γενικό πλαίσιο, αλλά ο καθένας πρέπει να το προσαρμόζει στις ιδιαιτερότητες του δικού του οργανισμού." },
  { sourceFrom: 195, sourceTo: 196, text: "Παράλληλα, ως άνθρωποι εξελιχθήκαμε να τρώμε με έναν συγκεκριμένο τρόπο. Ας προχωρήσουμε πέρα από τις δύο εβδομάδες." },
  { sourceFrom: 197, sourceTo: 199, text: "Ποια τρόφιμα θα μπορούσε κάποιος να αρχίσει να επανεισάγει μετά τις δύο εβδομάδες;" },
  { sourceFrom: 200, sourceTo: 201, text: "Ποια είναι λιγότερο πιθανό να προκαλέσουν αρνητική αντίδραση; Κρόκος αυγού." },
  { sourceFrom: 202, sourceTo: 204, text: "Πάντα προτείνω πρώτα τον κρόκο, επειδή στους ανθρώπους λείπει αυτή η κρεμώδης υφή." },
  { sourceFrom: 205, sourceTo: 208, text: "Μετά δοκιμάζουν το ασπράδι και, αν τους ταιριάζουν και τα δύο, μπορούν να τα χρησιμοποιούν μαζί και να φτιάχνουν φαγητά με αυγό." },
  { sourceFrom: 209, sourceTo: 211, text: "Στην επόμενη επίσκεψη μου λένε τι πρόσθεσαν. Τους ρωτάω: «Το δοκίμασες αυτό; Και εκείνο; Τι λειτούργησε και τι όχι;»" },
  { sourceFrom: 212, sourceTo: 215, text: "Αν σου άρεσε αυτό το απόσπασμα, πήγαινε να δεις ολόκληρο το επεισόδιο. Θα τα πούμε εκεί. Στη συνέχεια ξεκινά ένα νέο απόσπασμα." },
  { sourceFrom: 216, sourceTo: 218, text: "Όποιος τρώει μόνο φυτικές τροφές δεν παίρνει χοληστερόλη από τη διατροφή και δυσκολεύεται να παράγει αρκετές ορμόνες." },
  { sourceFrom: 219, sourceTo: 221, text: "Ιδιαίτερα οι γυναίκες χρειάζονται αυτές τις ορμόνες για τον κύκλο, την εφηβεία και την απόκριση στο στρες. Εξελιχθήκαμε να τρώμε αυτή την τροφή· εξελιχθήκαμε να τρώμε κρέας." },
];

const TERMINAL_PUNCTUATION = /[.!?;…»”]$/u;
const SPOKEN_FILLER = /(^|[\s,.!?;:—-])(?:ε|εε|uh|um)(?=$|[\s,.!?;:—-])/iu;
const ORPHAN_END = /(?:^|\s)(?:η|ο|το|τη|την|να|και|για|με|σε|από|που|ότι|θα|στο|στη|στην|τον|ένα|μια|ή)[.!?;…»”]?$/iu;

function sourceStart(id: number) {
  const value = SOURCE_STARTS[id];
  if (typeof value !== "number") throw new Error(`WQCO v4 unknown source cue ${id}`);
  return value;
}

export const WQCO_REVIEW_V4_LEDGER: V4CoverageRow[] = V4_BLOCKS.map((block, index) => {
  const start = sourceStart(block.sourceFrom);
  const nextStart = index + 1 < V4_BLOCKS.length
    ? sourceStart(V4_BLOCKS[index + 1].sourceFrom)
    : SOURCE_END;
  return { ...block, start, duration: nextStart - start };
});

export const WQCO_REVIEW_V4_CUES: ReviewCue[] = WQCO_REVIEW_V4_LEDGER.map((row) => ({
  start: row.start,
  duration: row.duration,
  text: row.text,
}));

function validateV4() {
  let expectedSourceCue = 0;
  let minDuration = Infinity;
  let maxDuration = 0;
  let maxCharsPerSecond = 0;

  for (const row of WQCO_REVIEW_V4_LEDGER) {
    if (row.sourceFrom !== expectedSourceCue) {
      throw new Error(`WQCO v4 unmapped source cue: expected ${expectedSourceCue}, got ${row.sourceFrom}`);
    }
    if (row.sourceTo < row.sourceFrom || row.sourceTo >= SOURCE_CUE_COUNT) {
      throw new Error(`WQCO v4 invalid source range ${row.sourceFrom}-${row.sourceTo}`);
    }
    expectedSourceCue = row.sourceTo + 1;

    const text = row.text.replace(/\s+/g, " ").trim();
    const compactChars = text.replace(/\s/g, "").length;
    const cps = compactChars / row.duration;

    if (row.start !== sourceStart(row.sourceFrom)) {
      throw new Error(`WQCO v4 start drift at source cue ${row.sourceFrom}`);
    }
    if (!Number.isFinite(row.duration) || row.duration < 2.2) {
      throw new Error(`WQCO v4 cue too short at ${row.start}: ${row.duration}s`);
    }
    if (row.duration > 12.5) {
      throw new Error(`WQCO v4 cue too long at ${row.start}: ${row.duration}s`);
    }
    if (!text || !TERMINAL_PUNCTUATION.test(text)) {
      throw new Error(`WQCO v4 incomplete phrase at ${row.start}: ${text}`);
    }
    if (SPOKEN_FILLER.test(text)) {
      throw new Error(`WQCO v4 filler leaked into Greek display at ${row.start}`);
    }
    if (ORPHAN_END.test(text)) {
      throw new Error(`WQCO v4 orphan word at ${row.start}: ${text}`);
    }
    if (cps > 20) {
      throw new Error(`WQCO v4 reading speed too high at ${row.start}: ${cps.toFixed(1)} cps`);
    }

    minDuration = Math.min(minDuration, row.duration);
    maxDuration = Math.max(maxDuration, row.duration);
    maxCharsPerSecond = Math.max(maxCharsPerSecond, cps);
  }

  if (expectedSourceCue !== SOURCE_CUE_COUNT) {
    throw new Error(`WQCO v4 source coverage incomplete: ${expectedSourceCue}/${SOURCE_CUE_COUNT}`);
  }

  return {
    sourceCueCount: SOURCE_CUE_COUNT,
    coveredSourceCueCount: expectedSourceCue,
    unmappedSourceCueIds: [] as number[],
    displayCueCount: WQCO_REVIEW_V4_CUES.length,
    minDuration: Number(minDuration.toFixed(2)),
    maxDuration: Number(maxDuration.toFixed(2)),
    maxCharsPerSecond: Number(maxCharsPerSecond.toFixed(1)),
    coveragePercent: 100,
  };
}

export const WQCO_REVIEW_V4_QUALITY = validateV4();
