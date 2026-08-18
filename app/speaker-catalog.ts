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

const SPEAKER_PROFILES = [SARAH_MYHILL, NATASHA_CAMPBELL_MCBRIDE, DAVID_BROWNSTEIN, STASHA_GOMINAK, PHILIP_OVADIA];

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
