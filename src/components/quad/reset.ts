/**
 * The Quad's hard reset (R): the car back at the start, and everything else back as it was: the loose
 * things home (./Physical), the cookies swept up (./CookieStand), the car's doors and trunk shut, the
 * camera out of any close look. Each part listens with `onReset`.
 */
const subs = new Set<() => void>()
export const onReset = (f: () => void) => (subs.add(f), () => void subs.delete(f))
export const hardReset = () => subs.forEach((f) => f())
