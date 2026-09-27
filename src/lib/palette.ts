/**
 * The room's palette: every surface colour comes from this short list, so the whole room lives in
 * one deliberate set of colours (Firewatch / Bruno: a very small palette per scene). Local colours
 * are warm or neutral; the cool comes from the light (the lavender shade and the blue-hour window),
 * not from the objects. Blue hour: the lamp and the fairy lights carry the room.
 *
 * Surfaces
 */
export const PAL = {
  cream: '#efe2d4', // walls, ceiling
  white: '#faf3ea', // trim, blinds, bedding, desk frame, outlets
  honey: '#d7a77f', // floor
  maple: '#e3b384', // desk top, drawer fronts
  mapleDeep: '#cf9a6a', // maple edges, drawer boxes and carcass
  plum: '#3d3656', // the darks: bed frame, keypad, desk motor, liners
  dusk: '#6a6286', // closet frames and tracks
  silver: '#d8d3de', // lamp metal, closet rod
  mirror: '#4e4868', // mirror glass base (it mostly shows its reflection)
  blanket: '#6f80b5', // Rina's blue fleece blanket, a dusty blue so it sits in the room
  blanketLight: '#b7c1df', // its sherpa inside
  shade: '#f3c545', // the lamp's yellow shade
  base: '#40375a', // the diorama slab the room sits on

  // Light (not surfaces)
  amber: '#ffb877', // the lamp
  fairy: '#ffcf8f', // the string lights
  twilight: '#9fa8ee', // blue hour through the window
} as const

/** Blue hour outside and around the diorama. */
export const SKY = {
  top: '#1f2450', // deep blue overhead
  mid: '#4a4f9a', // periwinkle
  low: '#e39a86', // the last warm band at the horizon
  bgTop: '#262a55', // the background the room floats on
  bgLow: '#5a4a7c',
} as const
