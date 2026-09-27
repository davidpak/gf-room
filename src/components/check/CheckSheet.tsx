import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera, View } from '@react-three/drei'
import { PCFShadowMap, Vector3 } from 'three'

/**
 * One-screenshot verification page, reusable for any component.
 * One canvas, several drei <View>s. Reference photos sit next to fixed views
 * so proportions get checked against the spec before style.
 */
export type CheckView =
  | { kind: 'image'; label: string; src: string }
  | { kind: 'hero'; label: string; position: [number, number, number]; target: [number, number, number]; fov?: number; scene?: () => ReactNode }
  | { kind: 'ortho'; label: string; from: Vector3; at: Vector3; up?: Vector3; zoom: number; scene?: () => ReactNode }
  | { kind: 'text'; label: string; text: string }

function Aim({ at, up }: { at: Vector3; up?: Vector3 }) {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    if (up) camera.up.copy(up)
    camera.lookAt(at)
    camera.updateProjectionMatrix()
  }, [camera, at, up])
  return null
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ position: 'relative', border: '1px solid #3a3160', borderRadius: 8, overflow: 'hidden' }}>
      {children}
      <div style={{ position: 'absolute', left: 8, top: 6, fontSize: 12, color: '#cfc6ff', pointerEvents: 'none', textShadow: '0 1px 2px #000' }}>
        {label}
      </div>
    </div>
  )
}

export function CheckSheet({ views, scene }: { views: CheckView[]; scene: () => ReactNode }) {
  const container = useRef<HTMLDivElement>(null!)
  return (
    <div ref={container} style={{ position: 'relative', height: '100vh' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: `repeat(${Math.ceil(views.length / 3)}, 1fr)`, gap: 8, padding: 8, height: '100%' }}>
        {views.map((v, i) => (
          <Panel key={i} label={v.label}>
            {v.kind === 'image' && <img src={v.src} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />}
            {v.kind === 'text' && (
              <pre style={{ margin: 0, padding: '28px 12px', fontSize: 12, lineHeight: 1.5, color: '#e6e0ff', whiteSpace: 'pre-wrap' }}>{v.text}</pre>
            )}
            {v.kind === 'hero' && (
              <View style={{ width: '100%', height: '100%' }}>
                <PerspectiveCamera makeDefault position={v.position} fov={v.fov ?? 30} near={1} far={20000} />
                {v.scene ? v.scene() : scene()}
                <OrbitControls target={v.target} enablePan={false} enableDamping />
              </View>
            )}
            {v.kind === 'ortho' && (
              <View style={{ width: '100%', height: '100%' }}>
                <OrthographicCamera makeDefault position={v.from.toArray()} zoom={v.zoom} near={1} far={20000} />
                <Aim at={v.at} up={v.up} />
                {v.scene ? v.scene() : scene()}
              </View>
            )}
          </Panel>
        ))}
      </div>
      <Canvas eventSource={container} shadows={{ type: PCFShadowMap }} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} gl={{ antialias: true }}>
        <View.Port />
      </Canvas>
    </div>
  )
}
