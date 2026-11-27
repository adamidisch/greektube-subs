/* Αυτόματος τίτλος στιγμής: 2–3 συνεχόμενες λέξεις από τον υπότιτλο, χωρίς άρθρα και συνδέσμους στις άκρες,
   ώστε να διαβάζεται σαν φράση που βγάζει νόημα (π.χ. «αντίσταση στην ινσουλίνη»). Καθαρή συνάρτηση, χωρίς AI και δίκτυο. */

const STOP_WORDS = `ο η το οι τα τον την των του της τους τις ένα μια μία ένας και κι να θα δεν μη μην που πως ότι αν ή αλλά για με σε από προς στο στη στην στον στα στους στις ως όπως είναι ήταν έχει έχουν έχω μπορεί μπορώ πολύ πιο όλα αυτό αυτή αυτά αυτός εκεί εδώ τώρα τότε επίσης όμως λοιπόν ναι όχι κάτι κάθε μου σου μας σας μέσα ε
the a an and or but if so to of in on at for with from by is are was were be been being it its this that these those i you he she we they me my your our their as not no do does did have has had can will would just really very also then there here what which who how why when about into over than too out up down like um uh yeah okay ok`;

const norm = (word: string) => word.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const STOP = new Set(STOP_WORDS.split(/\s+/).map(norm));

const isContent = (word: string) => !STOP.has(norm(word)) && (word.match(/\p{L}/gu)?.length || 0) >= 4;

export function momentLabel(text: string, fallback = ""): string {
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).slice(0, 40);
  if (!words.length) return fallback;
  let best: { start: number; size: number; score: number } | null = null;
  for (const size of [3, 2]) {
    for (let start = 0; start + size <= words.length; start++) {
      const slice = words.slice(start, start + size);
      if (!isContent(slice[0]) || !isContent(slice[size - 1])) continue;
      const content = slice.filter(isContent);
      const score = content.reduce((sum, word) => sum + word.length, 0) - (size - content.length) * 3 + (size === 3 ? 2 : 0);
      if (slice.join(" ").length > 34) continue;
      if (!best || score > best.score) best = { start, size, score };
    }
    if (best) break;
  }
  const picked = best ? words.slice(best.start, best.start + best.size) : [words.filter(isContent).sort((a, b) => b.length - a.length)[0]].filter(Boolean);
  if (!picked.length) return fallback;
  const label = picked.join(" ");
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}
