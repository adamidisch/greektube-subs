export type CanonicalSpeakerProfile = {
  name: string;
  role: string;
  importance: string;
  currentWork: string;
  highlights: string[];
};

const SARAH_MYHILL: CanonicalSpeakerProfile = {
  name: "Dr. Sarah Myhill",
  role: "Ιατρός με πολυετή ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",
  importance: "Γνωστή για το εκπαιδευτικό της έργο γύρω από τη χρόνια κόπωση τη μιτοχονδριακή λειτουργία τη διατροφή και τον τρόπο ζωής.",
  currentWork: "Γράφει διδάσκει και δημοσιεύει εκπαιδευτικό υλικό γύρω από τη χρόνια κόπωση τη διατροφή και τη μεταβολική υγεία.",
  highlights: ["ME/CFS και χρόνια κόπωση", "Μιτοχόνδρια και ενέργεια", "Διατροφή και μικροθρεπτικά", "Περιβαλλοντικοί παράγοντες"],
};

const NATASHA_CAMPBELL_MCBRIDE: CanonicalSpeakerProfile = {
  name: "Dr. Natasha Campbell-McBride",
  role: "Ιατρός με μεταπτυχιακή εκπαίδευση στη νευρολογία και στην ανθρώπινη διατροφή",
  importance: "Γνωστή για την προσέγγιση GAPS και το έργο της γύρω από τη σχέση εντέρου εγκεφάλου και διατροφής.",
  currentWork: "Γράφει και εκπαιδεύει γύρω από τη διατροφή το μικροβίωμα και την προσέγγιση GAPS.",
  highlights: ["Σχέση εντέρου και εγκεφάλου", "Ανθρώπινη διατροφή", "Μικροβίωμα", "GAPS"],
};

export const SPEAKER_CATALOG: Record<string, CanonicalSpeakerProfile> = {
  "Tk47F--QyY8": {
    name: "Dr. David Brownstein",
    role: "Ιατρός οικογενειακής ιατρικής με εστίαση στο ιώδιο και στον θυρεοειδή",
    importance: "Κλινικός ιατρός και συγγραφέας με πολυετή ενασχόληση με το ιώδιο και τη λειτουργία του θυρεοειδούς.",
    currentWork: "Συνεχίζει την κλινική και εκπαιδευτική του δραστηριότητα γύρω από το ιώδιο και τη μεταβολική υγεία.",
    highlights: ["Ιώδιο", "Θυρεοειδής", "Οικογενειακή ιατρική", "Μεταβολική υγεία"],
  },
  BbGv7GTbRN8: {
    name: "Dr. Stasha Gominak",
    role: "Νευρολόγος",
    importance: "Γνωστή για το εκπαιδευτικό της έργο γύρω από τον ύπνο και τη βιταμίνη D.",
    currentWork: "Συνεχίζει το εκπαιδευτικό της έργο γύρω από τον ύπνο και τη βιταμίνη D.",
    highlights: ["Νευρολογία", "Ύπνος", "Βιταμίνη D", "Εκπαίδευση"],
  },
  ZpfFabBsGlw: NATASHA_CAMPBELL_MCBRIDE,
  D2RjneeG_xA: SARAH_MYHILL,
  "0_adZSC0sFI": SARAH_MYHILL,
  KkBy__7d9Fs: SARAH_MYHILL,
  "fX2z-BF8Jac": NATASHA_CAMPBELL_MCBRIDE,
  NqLpQhii_fU: SARAH_MYHILL,
  ATKu1Cxs2Pc: {
    name: "Dr. Philip Ovadia",
    role: "Καρδιοθωρακοχειρουργός και ειδικός στη μεταβολική υγεία",
    importance: "Γνωστός για το έργο του γύρω από τη σύνδεση της μεταβολικής υγείας με την πρόληψη της καρδιοπάθειας.",
    currentWork: "Συνεχίζει την κλινική και εκπαιδευτική του δραστηριότητα γύρω από την καρδιαγγειακή και μεταβολική υγεία.",
    highlights: ["Καρδιοχειρουργική", "Καρδιαγγειακή πρόληψη", "Μεταβολική υγεία", "Διατροφή"],
  },
};

export function canonicalSpeakerForVideo(videoId: string) {
  return SPEAKER_CATALOG[videoId] || null;
}

export function normalizedPersonName(value: string) {
  return value.toLowerCase().replace(/^dr\.?\s+/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function speakerMatchesChannel(speakerName: string | undefined, channel: string | undefined) {
  if (!speakerName || !channel) return false;
  return normalizedPersonName(speakerName) === normalizedPersonName(channel);
}
