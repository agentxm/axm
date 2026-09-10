const isUnsafeTerminalCodePoint = (codePoint: number): boolean =>
  codePoint <= 0x08 ||
  codePoint === 0x0b ||
  codePoint === 0x0c ||
  (codePoint >= 0x0e && codePoint <= 0x1f) ||
  (codePoint >= 0x7f && codePoint <= 0x9f) ||
  codePoint === 0x061c ||
  codePoint === 0x200e ||
  codePoint === 0x200f ||
  (codePoint >= 0x202a && codePoint <= 0x202e) ||
  (codePoint >= 0x2066 && codePoint <= 0x2069);

/** Render untrusted bundle-authored text without permitting terminal control or bidi spoofing. */
export const sanitizeKnowledgeTerminalText = (value: string): string =>
  [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined || !isUnsafeTerminalCodePoint(codePoint)
        ? character
        : `\\u{${codePoint.toString(16).padStart(4, "0")}}`;
    })
    .join("");
