export function hasTranslatableWordTokens(tokens: string[], protectedTokens: string[]) {
  const protectedSet = new Set(protectedTokens.map(token => token.toLowerCase()));
  return tokens.some(token => /\p{L}/u.test(token) && !protectedSet.has(token.toLowerCase()));
}
