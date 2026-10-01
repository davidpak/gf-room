import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three'

/**
 * Surfaces made from rings (bread, a baguette, paper round a sandwich): ring after ring of points,
 * stitched into a skin, with a colour per point. Rings needn't close (`closed` false: a strip, the
 * paper's open top). `orient` turns every face out from its inside.
 */
export type Ring = { p: Vector3[]; c?: Color[] }

export function loft(rings: Ring[], closed = true) {
  const n = rings[0].p.length
  const pos = new Float32Array(rings.length * n * 3)
  const col = new Float32Array(rings.length * n * 3)
  const uv = new Float32Array(rings.length * n * 2)
  rings.forEach((r, i) =>
    r.p.forEach((p, k) => {
      const j = i * n + k
      pos.set([p.x, p.y, p.z], j * 3)
      const c = r.c?.[k]
      col.set(c ? [c.r, c.g, c.b] : [1, 1, 1], j * 3)
      uv.set([k / (n - 1), i / (rings.length - 1)], j * 2)
    }),
  )
  const idx: number[] = []
  const m = closed ? n : n - 1
  for (let i = 0; i < rings.length - 1; i++)
    for (let k = 0; k < m; k++) {
      const a = i * n + k
      const b = i * n + ((k + 1) % n)
      const c = a + n
      const d = b + n
      idx.push(a, b, c, b, d, c)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** every face turned to look out, away from `inside(centre of the face)`, and its normals made */
export function orient(g: BufferGeometry, inside: (c: Vector3) => Vector3) {
  const p = g.attributes.position
  const ix = g.index!.array as Uint16Array | Uint32Array
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const n = new Vector3()
  const m = new Vector3()
  let vote = 0
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i])
    b.fromBufferAttribute(p, ix[i + 1])
    c.fromBufferAttribute(p, ix[i + 2])
    n.subVectors(b, a).cross(m.subVectors(c, a))
    const area = n.length()
    if (area < 1e-6) continue
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    vote += Math.sign(n.dot(m.clone().sub(inside(m))))
  }
  if (vote < 0) {
    const arr = Array.from(ix)
    for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]]
    g.setIndex(arr)
  }
  g.computeVertexNormals()
  return g
}

/** a colour varied a little (a seeded random `r`): toast, crust, skins */
export const vary = (hex: string, r: () => number, amt = 0.06) => {
  const c = new Color(hex)
  const k = 1 + (r() - 0.5) * 2 * amt
  return c.multiplyScalar(k)
}
