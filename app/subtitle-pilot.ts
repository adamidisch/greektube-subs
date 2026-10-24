import type { SubtitleEvent } from "./subtitle-track";

// Candidate only. Not audio-reviewed or approved for publication.
export const SARAH_PILOT_EVENTS:SubtitleEvent[] = [
  {
    "start": 86.0,
    "duration": 8.0,
    "text": "Δρ Myhill, κάποιος σάς λέει:\n«Κοιμάμαι καλά και αρκετές ώρες.",
    "sourceIndices": [
      12
    ],
    "timing": "estimated"
  },
  {
    "start": 94.0,
    "duration": 9.0,
    "text": "Όμως ξυπνώ εξαντλημένος\nκαι δεν έχω ενέργεια. Τι συμβαίνει;»",
    "sourceIndices": [
      13
    ],
    "timing": "estimated"
  },
  {
    "start": 103.0,
    "duration": 7.0,
    "text": "Είναι τυπικό σύμπτωμα ανεπαρκούς\nπαροχής ενέργειας.",
    "sourceIndices": [
      14
    ],
    "timing": "estimated"
  },
  {
    "start": 110.0,
    "duration": 5.0,
    "text": "Για τους μηχανισμούς παροχής ενέργειας,\nχρησιμοποιώ την αναλογία του αυτοκινήτου.",
    "sourceIndices": [
      15
    ],
    "timing": "estimated"
  },
  {
    "start": 115.0,
    "duration": 7.5,
    "text": "Για να κινηθεί το σώμα σαν αυτοκίνητο,\nθέλει σωστά καύσιμα: διατροφή και έντερο.",
    "sourceIndices": [
      16
    ],
    "timing": "estimated"
  },
  {
    "start": 122.5,
    "duration": 1.5,
    "text": "Χρειάζεται επίσης οξυγόνο.",
    "sourceIndices": [
      16
    ],
    "timing": "estimated"
  },
  {
    "start": 124.0,
    "duration": 3.0,
    "text": "Έπειτα, τον μιτοχονδριακό κινητήρα.",
    "sourceIndices": [
      17
    ],
    "timing": "estimated"
  },
  {
    "start": 127.0,
    "duration": 7.0,
    "text": "Ο θυρεοειδής είναι το γκάζι που ορίζει\nπόσο γρήγορα δουλεύει ο κινητήρας.",
    "sourceIndices": [
      18
    ],
    "timing": "estimated"
  },
  {
    "start": 134.0,
    "duration": 6.0,
    "text": "Τα επινεφρίδια είναι το κιβώτιο ταχυτήτων:\nανεβάζουν ρυθμό όταν υπάρχει στρες.",
    "sourceIndices": [
      19
    ],
    "timing": "estimated"
  }
];

export function isSarahPilot(search:string):boolean {
  const params=new URLSearchParams(search);
  return params.get("subtitlePilot")==="sarah-v1";
}
