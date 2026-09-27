/**
 * While something takes the pointer and the keys for itself (the laptop's screen, used), the world
 * leaves them alone: the hand doesn't pick things up, lids and tabs don't toggle.
 */
export const worldInput = { locked: false }

/** a key pressed while typing (in a field, in an editable note, anywhere on RinaOS): the room's
 *  keyboard shortcuts leave it alone */
export function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t?.closest?.('input, textarea, select, [contenteditable="true"], .ros-root')
}
