// (troika-three-text ships no types: the one function used directly, to fetch a font and lay out its glyphs early)
declare module 'troika-three-text' {
  export function preloadFont(options: { font?: string; characters?: string | string[] }, callback: () => void): void
}
