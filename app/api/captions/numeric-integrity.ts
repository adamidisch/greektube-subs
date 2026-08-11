export function canonicalNumberTokens(text: string) {
  // English decade forms (1980s, 1990s, 2000s) carry the same immutable
  // numeric value as their Greek year/decade rendering (1980, 1990, 2000).
  const matches = text.match(/\b\d+(?:[.,]\d+)*(?:s\b)?/gi) || [];
  return matches.map(token => {
    const numeric = /s$/i.test(token) ? token.slice(0, -1) : token;
    return numeric.replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  });
}

export function numberTokensMatch(source: string, target: string) {
  const left = canonicalNumberTokens(source).sort();
  const right = canonicalNumberTokens(target).sort();
  return left.length === right.length && left.every((token, index) => token === right[index]);
}
