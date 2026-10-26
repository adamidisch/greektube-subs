/** Editorial titles for videos with reviewed Greek naming. */
export const EDITORIAL_VIDEO_TITLES: Readonly<Record<string,string>> = {
  xYB6uYyRjCA: "Πέρα από τις εξετάσεις: Θυρεοειδής, μεταβολισμός και κυτταρική ενέργεια | Δρ Sarah Myhill",
};

export function editorialVideoTitle(id: string, fallback: string): string {
  return EDITORIAL_VIDEO_TITLES[id] || fallback;
}
