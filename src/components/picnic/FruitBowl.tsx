import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { DoubleSide, Euler, LatheGeometry, Matrix4, Quaternion, Vector2, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { BERRY, berryGeo, calyxGeo, LEAF } from './Strawberries'
import { GRAPES, SPHERE } from './Grapes'
import { paint, rng } from './paint'

/**
 * A bowl of fruit (../spec [B']), in real millimetres: a stoneware bowl in a speckled reactive glaze (cream
 * inside, running to a soft blue at its rim, the clay bare at its foot), heaped with strawberries and loose
 * grapes, green and red. Click one to eat it (`eaten`, by index; `onEat`).
 *
 * Its frame: standing on y = 0, its middle at the origin.
 */
export const BOWL = { r: 82, foot: 40, h: 68, wall: 6 } // [B'] a 6 1/2" bowl
const { r: R, foot: F, h: H, wall: T } = BOWL

const glazeTex = paint(256, 256, (g) => {
  const r = rng(8)
  const gr = g.createLinearGradient(0, 0, 0, 256)
  // (its uvs run up the profile: the foot outside at the bottom, round the rim, down inside at the top)
  gr.addColorStop(0, '#c9a585')
  gr.addColorStop(0.08, '#c9a585')
  gr.addColorStop(0.1, '#efe6d8')
  gr.addColorStop(0.4, '#e8e2d6')
  gr.addColorStop(0.47, '#8fa6b8')
  gr.addColorStop(0.53, '#8fa6b8')
  gr.addColorStop(0.62, '#efe7da')
  gr.addColorStop(1, '#f3ece0')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '120,90,70' : '90,110,130'},${0.25 + r() * 0.4})`
    g.fillRect(r() * 256, r() * 256, 1.2, 1.2)
  }
  // the blue running down in drips from the rim
  for (let x = 0; x < 256; x += 9) {
    g.fillStyle = 'rgba(143,166,184,0.7)'
    g.fillRect(x + r() * 4, 256 * 0.4 - r() * 18, 4 + r() * 3, 18 + r() * 14)
  }
})
const GLAZE = bruno({ map: glazeTex ?? undefined, color: '#ffffff', shade: '#9a90a2', side: DoubleSide, sheen: 0.3 })

let made: ReturnType<typeof build> | null = null
function build() {
  const r = rng(77)
  // its profile: the foot ring, out and up its side, round the rim, back down inside
  const prof: Vector2[] = [new Vector2(F - 8, 0), new Vector2(F, 0), new Vector2(F + 2, 7)]
  for (let i = 1; i <= 10; i++) {
    const t = i / 10
    prof.push(new Vector2(F + 2 + (R - F - 2) * Math.sin((t * Math.PI) / 2), 7 + (H - 7) * (1 - Math.cos((t * Math.PI) / 2))))
  }
  prof.push(new Vector2(R - T / 2, H + 2))
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    prof.push(new Vector2((R - T) * Math.cos((t * Math.PI) / 2) * 0.98 + 1, H - (H - T - 4) * Math.sin((t * Math.PI) / 2)))
  }
  const bowl = new LatheGeometry(prof, 64)
  // the fruit heaped in it: strawberries over grapes
  const fruit: { kind: 'berry' | 'green' | 'red'; m: Matrix4; len?: number; w?: number }[] = []
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4 + r()
    const d = (i < 8 ? 45 : 22) * Math.sqrt(r())
    const y = (i < 8 ? 28 : 46) + r() * 8
    const kind = i % 3 === 0 ? 'red' : 'green'
    const k = kind === 'red' ? 1 : 0
    const s = GRAPES[k].r * (0.95 + r() * 0.15)
    fruit.push({ kind, m: new Matrix4().compose(new Vector3(Math.cos(a) * d, y, Math.sin(a) * d), new Quaternion().setFromEuler(new Euler(r() * 3, r() * 3, 0)), new Vector3(s, s * GRAPES[k].long, s)) })
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + r() * 0.4
    const d = i ? 34 + r() * 8 : 0
    const len = 34 + r() * 6
    fruit.push({ kind: 'berry', len, w: len * 0.4, m: new Matrix4().compose(new Vector3(Math.cos(a) * d, 58 + (i ? 0 : 8) + r() * 4, Math.sin(a) * d), new Quaternion().setFromEuler(new Euler(1.2 + r() * 0.6, a + r(), 0)), new Vector3(1, 1, 1)) })
  }
  const geos = fruit.map((f) => (f.kind === 'berry' ? { body: berryGeo(f.len!, f.w!), calyx: calyxGeo(f.w!) } : null))
  return { bowl, fruit, geos }
}
const GRAPE = GRAPES.map((G) => bruno({ color: G.color, shade: G.shade, sheen: 0.35 }))

export function FruitBowl({ eaten, onEat }: { eaten?: Set<number>; onEat?: (i: number, e: ThreeEvent<MouseEvent>) => void }) {
  const g = useMemo(() => (made ??= build()), [])
  return (
    <group>
      <mesh geometry={g.bowl} material={GLAZE} castShadow receiveShadow />
      {g.fruit.map((f, i) =>
        eaten?.has(i) ? null : (
          <group key={i} matrix={f.m} matrixAutoUpdate={false} onClick={onEat ? (e) => (e.stopPropagation(), onEat(i, e)) : undefined}>
            {f.kind === 'berry' ? (
              <group position={[0, -f.len! / 2, 0]}>
                <mesh geometry={g.geos[i]!.body} material={BERRY} castShadow />
                <mesh geometry={g.geos[i]!.calyx} material={LEAF} position={[0, f.len! * 0.97, 0]} />
              </group>
            ) : (
              <mesh geometry={SPHERE} material={GRAPE[f.kind === 'red' ? 1 : 0]} castShadow />
            )}
          </group>
        ),
      )}
    </group>
  )
}
