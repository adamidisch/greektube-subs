export type CanonicalSpeakerProfile = {
  name: string;
  role: string;
  importance: string;
  currentWork: string;
  highlights: string[];
  biography?: {
    profileLabel: string;
    introduction: string;
    facts: Array<{ label: string; text: string }>;
    infoNote?: string;
    sources: Array<{ label: string; url: string }>;
  };
};

const SARAH_MYHILL: CanonicalSpeakerProfile = {
  name: "Dr. Sarah Myhill",
  role: "Ιατρός",
  importance: "Γνωστή για το εκπαιδευτικό της έργο γύρω από τη χρόνια κόπωση τη μιτοχονδριακή λειτουργία τη διατροφή και τον τρόπο ζωής.",
  currentWork: "Γράφει διδάσκει και δημοσιεύει εκπαιδευτικό υλικό γύρω από τη χρόνια κόπωση τη διατροφή και τη μεταβολική υγεία.",
  highlights: ["ME/CFS και χρόνια κόπωση", "Μιτοχόνδρια και ενέργεια", "Διατροφή και μικροθρεπτικά", "Περιβαλλοντικοί παράγοντες"],
  biography: {
    profileLabel: "Προφίλ ομιλήτριας",
    introduction: "Ιατρική εκπαίδευση με πολυετή πορεία στη γενική και στην ιδιωτική πρακτική και ιδιαίτερο ενδιαφέρον για τη χρόνια κόπωση.",
    facts: [
      { label: "Σπουδές", text: "Middlesex Hospital Medical School στο Λονδίνο. Πτυχίο MB BS από το University of London το 1981." },
      { label: "Πορεία", text: "Εργάστηκε για περίπου 20 χρόνια ως γενική ιατρός στο NHS και στη συνέχεια πέρασε στην ιδιωτική πρακτική." },
      { label: "Αντικείμενο", text: "Ασχολήθηκε με την Περιβαλλοντική Ιατρική τη διατροφή και το σύνδρομο χρόνιας κόπωσης ME/CFS." },
      { label: "Εκπαιδευτικό έργο", text: "Έχει συγγράψει βιβλία και έχει παρουσιάσει εκπαιδευτικό υλικό για τη χρόνια κόπωση τη μιτοχονδριακή λειτουργία και τη διατροφή." },
    ],
    infoNote: "Επίσημη online παρουσία: ιστοσελίδα Dr Myhill ηλεκτρονικό κατάστημα και κανάλι YouTube.",
    sources: [
      { label: "Επίσημη ιστοσελίδα", url: "https://www.drmyhill.co.uk/" },
      { label: "Ηλεκτρονικό κατάστημα", url: "https://www.salesatdrmyhill.co.uk/" },
      { label: "Επίσημο κανάλι YouTube", url: "https://www.youtube.com/@drsarahmyhill5403" },
      { label: "GMC — μητρώο και προσόντα", url: "https://www.gmc-uk.org/registrants/2734668" },
      { label: "The Health Coach Group — βιογραφικό", url: "https://thehealthcoachgroup.com/blog/dr-sarah-myhill/" },
    ],
  },
};

const NATASHA_CAMPBELL_MCBRIDE: CanonicalSpeakerProfile = {
  name: "Dr. Natasha Campbell-McBride",
  role: "Νευρολόγος · Νευροχειρουργός",
  importance: "Γνωστή για την προσέγγιση GAPS και το έργο της γύρω από τη σχέση εντέρου εγκεφάλου και διατροφής.",
  currentWork: "Γράφει και εκπαιδεύει γύρω από τη διατροφή το μικροβίωμα και την προσέγγιση GAPS.",
  highlights: ["Σχέση εντέρου και εγκεφάλου", "Ανθρώπινη διατροφή", "Μικροβίωμα", "GAPS"],
  biography: {
    profileLabel: "Προφίλ ομιλήτριας",
    introduction: "Ιατρική εκπαίδευση με μεταπτυχιακές σπουδές στη νευρολογία και στην ανθρώπινη διατροφή.",
    facts: [
      { label: "Σπουδές", text: "Αποφοίτησε με άριστα από το Bashkir Medical University το 1984 και απέκτησε μεταπτυχιακούς τίτλους στη Νευρολογία και στην Ανθρώπινη Διατροφή." },
      { label: "Κλινική πορεία", text: "Εργάστηκε για πέντε χρόνια ως νευρολόγος και για τρία χρόνια ως νευροχειρουργός πριν μετακομίσει στο Ηνωμένο Βασίλειο." },
      { label: "Αντικείμενο", text: "Ανέπτυξε την προσέγγιση GAPS γύρω από τη σχέση του πεπτικού συστήματος με τη νευρολογική και τη γενικότερη υγεία." },
      { label: "Εκπαιδευτικό έργο", text: "Έχει συγγράψει βιβλία έχει εκπαιδεύσει επαγγελματίες GAPS και δίνει διαλέξεις διεθνώς." },
    ],
    infoNote: "Επίσημη online παρουσία μέσω της ιστοσελίδας GAPS.",
    sources: [
      { label: "GAPS — επίσημο βιογραφικό", url: "https://www.gaps.me/dr-campbell-mcbride.php" },
      { label: "GAPS — επίσημη ιστοσελίδα", url: "https://www.gapsdiet.com/about/" },
    ],
  },
};

const DAVID_BROWNSTEIN: CanonicalSpeakerProfile = {
  name: "Dr. David Brownstein",
  role: "Οικογενειακός ιατρός",
  importance: "Κλινικός ιατρός και συγγραφέας με πολυετή ενασχόληση με το ιώδιο και τη λειτουργία του θυρεοειδούς.",
  currentWork: "Συνεχίζει την κλινική και εκπαιδευτική του δραστηριότητα γύρω από το ιώδιο και τη μεταβολική υγεία.",
  highlights: ["Ιώδιο", "Θυρεοειδής", "Οικογενειακή ιατρική", "Μεταβολική υγεία"],
  biography: {
    profileLabel: "Προφίλ ομιλητή",
    introduction: "Πιστοποιημένος ιατρός οικογενειακής ιατρικής με κλινική και εκπαιδευτική δραστηριότητα στην ολιστική ιατρική.",
    facts: [
      { label: "Σπουδές", text: "Αποφοίτησε από το University of Michigan και το Wayne State University School of Medicine." },
      { label: "Ειδικότητα", text: "Είναι πιστοποιημένος στην Οικογενειακή Ιατρική." },
      { label: "Κλινική πορεία", text: "Είναι Medical Director του Center for Holistic Medicine στο West Bloomfield του Michigan." },
      { label: "Εκπαιδευτικό έργο", text: "Έχει δώσει διεθνείς διαλέξεις και έχει συγγράψει βιβλία γύρω από το ιώδιο τον θυρεοειδή και τη διατροφή." },
    ],
    infoNote: "Επίσημη online παρουσία μέσω της προσωπικής του ιστοσελίδας.",
    sources: [
      { label: "Επίσημο βιογραφικό", url: "https://www.drbrownstein.com/about" },
      { label: "Επίσημη ιστοσελίδα", url: "https://www.drbrownstein.com/" },
    ],
  },
};

const STASHA_GOMINAK: CanonicalSpeakerProfile = {
  name: "Dr. Stasha Gominak",
  role: "Νευρολόγος",
  importance: "Γνωστή για το εκπαιδευτικό της έργο γύρω από τον ύπνο και τη βιταμίνη D.",
  currentWork: "Συνεχίζει το εκπαιδευτικό της έργο γύρω από τον ύπνο και τη βιταμίνη D.",
  highlights: ["Νευρολογία", "Ύπνος", "Βιταμίνη D", "Εκπαίδευση"],
  biography: {
    profileLabel: "Προφίλ ομιλήτριας",
    introduction: "Νευρολόγος με πολυετή κλινική εμπειρία και ιδιαίτερο ενδιαφέρον για τον ύπνο τη βιταμίνη D και το μικροβίωμα.",
    facts: [
      { label: "Σπουδές", text: "Απέκτησε το MD από το Baylor College of Medicine το 1983." },
      { label: "Ειδικότητα", text: "Ολοκλήρωσε ειδικότητα στη Νευρολογία στο Massachusetts General Hospital που συνδέεται με το Harvard." },
      { label: "Κλινική πορεία", text: "Άσκησε τη νευρολογία για περίπου 30 χρόνια πριν κλείσει την κλινική της πρακτική." },
      { label: "Εκπαιδευτικό έργο", text: "Δημιούργησε το RightSleep και εκπαιδεύει γύρω από τη σχέση του ύπνου με τη βιταμίνη D τις βιταμίνες Β και το μικροβίωμα." },
    ],
    sources: [
      { label: "Επίσημο βιογραφικό", url: "https://drgominak.com/about/" },
      { label: "Επίσημη ιστοσελίδα", url: "https://drgominak.com/" },
    ],
  },
};

const PHILIP_OVADIA: CanonicalSpeakerProfile = {
  name: "Dr. Philip Ovadia",
  role: "Καρδιοθωρακοχειρουργός",
  importance: "Γνωστός για το έργο του γύρω από τη σύνδεση της μεταβολικής υγείας με την πρόληψη της καρδιοπάθειας.",
  currentWork: "Συνεχίζει την κλινική και εκπαιδευτική του δραστηριότητα γύρω από την καρδιαγγειακή και μεταβολική υγεία.",
  highlights: ["Καρδιοχειρουργική", "Καρδιαγγειακή πρόληψη", "Μεταβολική υγεία", "Διατροφή"],
  biography: {
    profileLabel: "Προφίλ ομιλητή",
    introduction: "Πιστοποιημένος καρδιοχειρουργός με κλινική εμπειρία στην καρδιοθωρακοχειρουργική και εστίαση στη μεταβολική υγεία.",
    facts: [
      { label: "Σπουδές", text: "Φοίτησε στο Pennsylvania State University και στο Jefferson Medical College." },
      { label: "Ειδικότητα", text: "Είναι πιστοποιημένος καρδιοχειρουργός με πολυετή εμπειρία στην καρδιοθωρακοχειρουργική." },
      { label: "Κλινική πορεία", text: "Ίδρυσε την Ovadia Cardiothoracic Surgery το 2020 και εργάζεται ως ανεξάρτητος χειρουργός στις Ηνωμένες Πολιτείες." },
      { label: "Εκπαιδευτικό έργο", text: "Ίδρυσε την Ovadia Heart Health και γράφει και διδάσκει γύρω από τη μεταβολική και την καρδιαγγειακή υγεία." },
    ],
    sources: [
      { label: "Ovadia Heart Health — βιογραφικό", url: "https://ovadiahearthealth.com/ovadia-heart-health-about/" },
      { label: "Ovadia Heart Health — επίσημη ιστοσελίδα", url: "https://ovadiahearthealth.com/" },
    ],
  },
};

const RHONDA_PATRICK: CanonicalSpeakerProfile = {
  name: "Dr. Rhonda Patrick",
  role: "Βιοϊατρική ερευνήτρια",
  importance: "Γνωστή για την επιστημονική ενημέρωση γύρω από τη διατροφή, την άσκηση και τη μακροζωία μέσω του FoundMyFitness.",
  currentWork: "Παρουσιάζει επιστημονικό περιεχόμενο για τη διατροφή, τον ύπνο, την άσκηση και την πρόληψη στο FoundMyFitness.",
  highlights: ["Σπλαγχνικό λίπος", "Άσκηση και ύπνος", "Διατροφή και μικροθρεπτικά", "Μακροζωία"],
  biography: {
    profileLabel: "Προφίλ ομιλήτριας",
    introduction: "Ερευνήτρια με διδακτορικό στη βιοϊατρική επιστήμη και εστίαση στη διατροφή, τη γήρανση και την πρόληψη.",
    facts: [
      { label: "Αντικείμενο", text: "Ασχολείται με τη διατροφή, την άσκηση, τον ύπνο και τη μακροζωία." },
      { label: "Εκπαιδευτικό έργο", text: "Είναι ιδρύτρια του FoundMyFitness, με επεισόδια, άρθρα και σύντομα clips βασισμένα σε μελέτες." },
    ],
    sources: [
      { label: "FoundMyFitness — επίσημη ιστοσελίδα", url: "https://www.foundmyfitness.com/" },
      { label: "FoundMyFitness — clip για το σπλαγχνικό λίπος", url: "https://www.foundmyfitness.com/episodes/the-most-effective-ways-to-reduce-visceral-fat" },
    ],
  },
};

const BEN_BIKMAN: CanonicalSpeakerProfile = {
  name: "Dr. Ben Bikman",
  role: "Μεταβολικός επιστήμονας",
  importance: "Γνωστός για την έρευνά του γύρω από την αντίσταση στην ινσουλίνη και τον ρόλο της στις χρόνιες παθήσεις.",
  currentWork: "Είναι καθηγητής στο Brigham Young University όπου μελετά την ινσουλίνη και τα κετονοσώματα.",
  highlights: ["Αντίσταση στην ινσουλίνη", "Μεταβολισμός", "Κετονοσώματα", "Παχυσαρκία και διαβήτης"],
  biography: {
    profileLabel: "Προφίλ ομιλητή",
    introduction: "Ερευνητής του μεταβολισμού με διδακτορικό στη βιοενεργητική και εστίαση στην αντίσταση στην ινσουλίνη.",
    facts: [
      { label: "Σπουδές", text: "Πτυχίο και μεταπτυχιακό στην επιστήμη της άσκησης από το BYU. Διδακτορικό στη βιοενεργητική από το East Carolina University." },
      { label: "Πορεία", text: "Μεταδιδακτορική έρευνα στη Σιγκαπούρη με το Duke-NUS Medical School. Διδάσκει στο BYU από το 2011." },
      { label: "Αντικείμενο", text: "Μελετά τις αιτίες και τις συνέπειες της αντίστασης στην ινσουλίνη και τη σχέση της με τη μιτοχονδριακή λειτουργία." },
      { label: "Εκπαιδευτικό έργο", text: "Συγγραφέας του βιβλίου Why We Get Sick (2020)." },
    ],
    sources: [
      { label: "BYU — ερευνητικό εργαστήριο", url: "https://cell.byu.edu/bikman-lab/principal-investigator" },
      { label: "BYU — σελίδα καθηγητή", url: "https://cell.byu.edu/directory/benjamin-bikman" },
    ],
  },
};

const JESSIE_INCHAUSPE: CanonicalSpeakerProfile = {
  name: "Jessie Inchauspé",
  role: "Βιοχημικός · Συγγραφέας",
  importance: "Γνωστή ως Glucose Goddess για τις πρακτικές συμβουλές της γύρω από τις διακυμάνσεις της γλυκόζης.",
  currentWork: "Γράφει βιβλία και δημιουργεί εκπαιδευτικό περιεχόμενο για τη γλυκόζη και τη διατροφή.",
  highlights: ["Γλυκόζη και σάκχαρο", "Διατροφικές συνήθειες", "Ενέργεια και λιγούρες", "Εκλαΐκευση"],
  biography: {
    profileLabel: "Προφίλ ομιλήτριας",
    introduction: "Γαλλίδα βιοχημικός και συγγραφέας με εστίαση στην ισορροπία του σακχάρου στο αίμα.",
    facts: [
      { label: "Σπουδές", text: "Πτυχίο στα μαθηματικά από το King's College London και μεταπτυχιακό στη βιοχημεία από το Georgetown University." },
      { label: "Εκπαιδευτικό έργο", text: "Συγγραφέας των βιβλίων Glucose Revolution (2022) και The Glucose Goddess Method (2023)." },
    ],
    infoNote: "Δεν είναι ιατρός. Ορισμένοι ειδικοί διατροφής έχουν εκφράσει επιφυλάξεις για την έμφαση στις αιχμές γλυκόζης.",
    sources: [
      { label: "Επίσημη ιστοσελίδα", url: "https://www.glucosegoddess.com/" },
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Jessie_Inchausp%C3%A9" },
    ],
  },
};

const ELIZABETH_BRIGHT: CanonicalSpeakerProfile = {
  name: "Dr. Elizabeth Bright",
  role: "Οστεοπαθής · Φυσιοπαθητικός",
  importance: "Γνωστή για τη χρήση διατροφής με λίπος και ζωικές τροφές ως θεραπευτικής προσέγγισης.",
  currentWork: "Ζει και εργάζεται στην Ιταλία και γράφει για τη διατροφή και την υγεία των γυναικών.",
  highlights: ["Φλεγμονή", "Κρεατοφαγική διατροφή", "Υγεία των γυναικών", "Φυσιοπαθητική"],
  biography: {
    profileLabel: "Προφίλ ομιλήτριας",
    introduction: "Αμερικανίδα οστεοπαθής και φυσιοπαθητικός (DO, ND) απόφοιτος του Columbia University.",
    facts: [
      { label: "Αντικείμενο", text: "Χρησιμοποιεί τη διατροφή με πολλά λιπαρά και ζωικές τροφές ως θεραπευτική προσέγγιση από το 2016." },
      { label: "Εκπαιδευτικό έργο", text: "Συγγραφέας του βιβλίου Good Fat is Good for Women: Menopause." },
    ],
    sources: [
      { label: "Βιογραφικό συγγραφέα", url: "https://www.abebooks.co.uk/author/b074shbrpk/elizabeth-bright" },
    ],
  },
};

const DAVID_FRIEDBERG: CanonicalSpeakerProfile = {
  name: "David Friedberg",
  role: "Επιστήμονας · Επιχειρηματίας",
  importance: "Γνωστός για τις επενδύσεις του στη βιοτεχνολογία και στη γεωργία και για τη δημόσια συζήτηση γύρω από την τεχνολογία.",
  currentWork: "Είναι ιδρυτής και CEO της The Production Board και μέλος του PCAST, του συμβουλίου επιστήμης και τεχνολογίας του Αμερικανού προέδρου.",
  highlights: ["Βιοτεχνολογία", "Επιγενετική και γήρανση", "Τεχνητή νοημοσύνη", "Γεωργία"],
  biography: {
    profileLabel: "Προφίλ ομιλητή",
    introduction: "Επιχειρηματίας με επιστημονικό υπόβαθρο. Δεν είναι ιατρός.",
    facts: [
      { label: "Πορεία", text: "Ιδρυτής και CEO της The Production Board, που δημιουργεί εταιρείες βιοτεχνολογίας και τροφίμων." },
      { label: "Δημόσιος ρόλος", text: "Μέλος του President's Council of Advisors on Science and Technology (PCAST)." },
    ],
    sources: [
      { label: "The Diary Of A CEO — επεισόδιο", url: "https://www.blackcountryradio.co.uk/podcasts/the-diary-of-a-ceo-with-steven-bartlett/episode/top-white-house-advisor-the-us-empire-is-dying-and-socialism-is-coming-next-david-friedberg/" },
    ],
  },
};

const SPEAKER_PROFILES = [SARAH_MYHILL, NATASHA_CAMPBELL_MCBRIDE, DAVID_BROWNSTEIN, STASHA_GOMINAK, PHILIP_OVADIA, RHONDA_PATRICK, BEN_BIKMAN, JESSIE_INCHAUSPE, ELIZABETH_BRIGHT, DAVID_FRIEDBERG];

export const SPEAKER_CATALOG: Record<string, CanonicalSpeakerProfile> = {
  "Tk47F--QyY8": DAVID_BROWNSTEIN,
  BbGv7GTbRN8: STASHA_GOMINAK,
  ZpfFabBsGlw: NATASHA_CAMPBELL_MCBRIDE,
  D2RjneeG_xA: SARAH_MYHILL,
  "0_adZSC0sFI": SARAH_MYHILL,
  KkBy__7d9Fs: SARAH_MYHILL,
  "fX2z-BF8Jac": NATASHA_CAMPBELL_MCBRIDE,
  NqLpQhii_fU: SARAH_MYHILL,
  ATKu1Cxs2Pc: PHILIP_OVADIA,
  NDeaXZ5KpM4: RHONDA_PATRICK,
  xYB6uYyRjCA: SARAH_MYHILL,
  grW_S9zcHdg: BEN_BIKMAN,
  h2Pf6xO_NVM: JESSIE_INCHAUSPE,
  WQCO8wlldAQ: ELIZABETH_BRIGHT,
  n1G3xqgzB2c: DAVID_FRIEDBERG,
};

export function normalizedPersonName(value: string) {
  return value.toLowerCase().replace(/^dr\.?\s+/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const SPEAKER_PROFILES_BY_NAME = new Map(SPEAKER_PROFILES.map(profile => [normalizedPersonName(profile.name), profile]));

export function canonicalSpeakerForVideo(videoId: string, ...identityCandidates: Array<string | undefined>) {
  const byVideo = SPEAKER_CATALOG[videoId];
  if (byVideo) return byVideo;
  for (const candidate of identityCandidates) {
    if (!candidate) continue;
    const byName = SPEAKER_PROFILES_BY_NAME.get(normalizedPersonName(candidate));
    if (byName) return byName;
  }
  return null;
}

export function speakerMatchesChannel(speakerName: string | undefined, channel: string | undefined) {
  if (!speakerName || !channel) return false;
  return normalizedPersonName(speakerName) === normalizedPersonName(channel);
}
