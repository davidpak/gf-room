import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Object3D, type Texture } from 'three'

/**
 * Where the setup's things meet, by name, wherever they've been carried to (each an empty group in its model): the
 * cables run between them (./Cable), the disc flies between its seats (./DiscFlight).
 *
 *   port1 port2   the controllers' plugs, in the console's front (their cables leave along +z)
 *   pad1 pad2     where each controller's cable leaves it (along its -z)
 *   avout         the AV plug in the console's back (-z); avin: the plugs in the TV's front jacks (+z)
 *   seat-console  the disc's place on the console's spindle; seat-case: on the case's hub
 */
export const anchors = new Map<string, Object3D>()
export const anchor = (name: string) => (o: Object3D | null) => {
  if (o) anchors.set(name, o)
  else anchors.delete(name)
}

/** a canvas painted into a texture */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
/** a texture for an extruded shape's caps, whose uv are the shape's own coordinates: spread over x0..x1, y0..y1 */
export function capped<T extends Texture>(t: T, x0: number, x1: number, y0: number, y1: number) {
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1 / (x1 - x0), 1 / (y1 - y0))
  t.offset.set(-x0 / (x1 - x0), -y0 / (y1 - y0))
  return t
}
/** an image, loaded (null if it's not there: the art's kept out of the repository) */
export function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((done) => {
    const im = new Image()
    im.onload = () => done(im)
    im.onerror = () => done(null)
    im.src = url
  })
}
/** a rounded rectangle's path */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}
