import { Suspense, useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Center, RoundedBox, Text, Text3D, useFont } from "@react-three/drei";
import { preloadFont } from "troika-three-text";
import { easing } from "maath";
import {
  Color,
  DoubleSide,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  Shape,
  type Group,
} from "three";
import { createMapleMaterial } from "../../lib/mapleMaterial";
import {
  chevron,
  roundedPolygon,
  roundedRect,
  roundedTriangle,
} from "../../lib/shapes";
import { IN, type KeypadButton, type Motor } from "../../lib/motor";
import { power } from "../../lib/power";
import { FACE, KP } from "./spec";
import { Waiting } from "../../lib/ready";

const FONT = "/fonts/helvetiker_bold.typeface.json";
const PIXEL_FONT = "/fonts/kenpixel.ttf";
// (both fonts fetched, and the display's digits laid out, as soon as this code arrives: alongside the rest of the
// loading, not after the desk is built, where they held the loading screen up ~5 s)
useFont.preload(FONT);
preloadFont({ font: PIXEL_FONT, characters: "0123456789." }, () => {});
const DIGIT = new Color("#7fe3ff");
const BEVEL_GROW = 1.2; // ExtrudeGeometry's bevelSize grows the outline; the face frame sits on the grown surface

const MAT = {
  housing: new MeshStandardMaterial({
    color: "#2f2947",
    roughness: 0.55,
    metalness: 0.05,
  }),
  bezel: new MeshStandardMaterial({ color: "#3a3456", roughness: 0.4 }),
  button: new MeshStandardMaterial({
    color: "#cfd1d6",
    roughness: 0.34,
    metalness: 0.12,
  }),
  label: new MeshStandardMaterial({ color: "#3a3456", roughness: 0.5 }),
  glass: new MeshStandardMaterial({
    color: "#07090c",
    roughness: 0.12,
    metalness: 0.3,
  }),
  maple: createMapleMaterial("#f3bd82", 0.5),
};

/** Housing = the side profile, extruded across the width. Correct wedge by construction. */
function useHousingGeometry() {
  return useMemo(() => {
    const {
      depth: D,
      height: H,
      faceTopInset,
      faceDrop,
      corner: c,
      width,
      endBevel,
    } = KP;
    const profile = roundedPolygon(
      [
        [-D, 0], // back-top
        [-faceTopInset, 0], // face-top (the "beveled top edge" starts here)
        [0, -faceDrop], // face-bottom
        [0, -H], // front-bottom
        [-D, -H], // back-bottom
      ],
      [c.backTop, c.faceTop, c.faceBottom, c.frontBottom, c.backBottom],
    );
    const depth = width - 2 * endBevel;
    const g = new ExtrudeGeometry(profile, {
      depth,
      bevelEnabled: true,
      bevelThickness: endBevel,
      bevelSize: BEVEL_GROW,
      bevelSegments: 5,
      curveSegments: 8,
    });
    // profile (u, v) = (z, y); extrusion (local z) becomes world x, centred
    g.rotateY(-Math.PI / 2);
    g.translate(depth / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  }, []);
}

function extrude(
  shape: Shape,
  depth: number,
  bevel: number,
  bevelSize = bevel * 0.75,
) {
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize,
    bevelSegments: 4,
    curveSegments: 10,
  });
}

/** The keypad. `motor` is owned by whoever mounts it (the desk, or the standalone stage). */
export function Keypad({
  motor,
  slab = true,
}: {
  motor: Motor;
  slab?: boolean;
}) {
  const housing = useHousingGeometry();

  const n = { y: Math.sin(FACE.angle), z: Math.cos(FACE.angle) };
  const facePos: [number, number, number] = [
    0,
    FACE.center.y + n.y * BEVEL_GROW,
    FACE.center.z + n.z * BEVEL_GROW,
  ];

  return (
    <group>
      {/* a slice of the maple desktop, so the keypad hangs from something when shown alone
          (rounded like the real desktop's edge, DESK.top.edge) */}
      {slab && (
        <RoundedBox
          args={[KP.desk.width, KP.desk.thick, KP.desk.depth]}
          radius={8}
          smoothness={4}
          position={[
            0,
            KP.desk.thick / 2 + 0.01,
            KP.desk.overhang - KP.desk.depth / 2,
          ]}
          material={MAT.maple}
          castShadow
          receiveShadow
        />
      )}

      <mesh
        geometry={housing}
        material={MAT.housing}
        castShadow
        receiveShadow
      />

      {/* the control face: laid out flat, rotated once */}
      <group position={facePos} rotation={[-FACE.angle, 0, 0]}>
        {/* (the display's font and the buttons' labels each behind their own Suspense: they arrive together, not one after the other) */}
        <Suspense fallback={<Waiting name="keypad-screen" />}>
          <Screen motor={motor} />
        </Suspense>
        {KP.presets.xs.map((x, i) => (
          <Button
            key={i}
            name={`preset${i + 1}` as KeypadButton}
            x={x}
            motor={motor}
            shape={roundedRect(
              KP.presets.size - 1.2,
              KP.presets.size - 1.2,
              KP.presets.radius,
            )}
          >
            <Suspense fallback={<Waiting name="keypad-labels" />}>
              <Center disableZ>
                <Text3D
                  font={FONT}
                  size={KP.label.size}
                  height={KP.label.depth}
                  curveSegments={6}
                  bevelEnabled
                  bevelSize={0.12}
                  bevelThickness={0.12}
                  material={MAT.label}
                  castShadow
                >
                  {KP.presets.labels[i]}
                </Text3D>
              </Center>
            </Suspense>
          </Button>
        ))}
        <Button
          name="up"
          x={KP.arrows.up}
          motor={motor}
          shape={roundedTriangle(
            KP.arrows.circumradius,
            KP.arrows.radius,
            true,
          )}
        >
          <Glyph shape={chevron(5.6, 3.4, 1.1, true)} y={-0.6} />
        </Button>
        <Button
          name="down"
          x={KP.arrows.down}
          motor={motor}
          shape={roundedTriangle(
            KP.arrows.circumradius,
            KP.arrows.radius,
            false,
          )}
        >
          <Glyph shape={chevron(5.6, 3.4, 1.1, false)} y={0.6} />
        </Button>
      </group>
    </group>
  );
}

/** Raised glyph sitting on a button's front cap. */
function Glyph({ shape, y = 0 }: { shape: Shape; y?: number }) {
  const geo = useMemo(() => extrude(shape, KP.label.depth, 0.12), [shape]);
  return (
    <mesh geometry={geo} material={MAT.label} position={[0, y, 0]} castShadow />
  );
}

function Button({
  name,
  x,
  shape,
  motor,
  children,
}: {
  name: KeypadButton;
  x: number;
  shape: Shape;
  motor: Motor;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const { depth, bevel } = KP.button;
  const geo = useMemo(
    () => extrude(shape, depth, bevel, 0.6),
    [shape, depth, bevel],
  );
  const mat = useMemo(() => MAT.button.clone(), []);
  const front = depth + bevel - 0.3; // z of the front cap once the mesh is sunk 0.3 into the face

  useFrame((_, dt) => {
    if (!group.current) return;
    const held = motor.held === name;
    easing.damp(group.current.position, "z", held ? -KP.press : 0, 0.05, dt);
    mat.emissive.set("#ffb070");
    easing.damp(mat, "emissiveIntensity", held ? 0.35 : 0, 0.08, dt);
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    motor.press(name);
  };

  return (
    <group
      ref={group}
      position={[x, 0, 0]}
      onPointerDown={down}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <mesh
        geometry={geo}
        material={mat}
        position={[0, 0, -0.3 - bevel]}
        castShadow
        receiveShadow
      />
      <group position={[0, 0, front - bevel - 0.1]}>{children}</group>
    </group>
  );
}

function Screen({ motor }: { motor: Motor }) {
  const { x, w, h, bezel } = KP.screen;
  const bezelGeo = useMemo(() => {
    const s = roundedRect(w + 2 * bezel, h + 2 * bezel, 2.4);
    s.holes.push(roundedRect(w, h, 1.4, new Path()));
    return extrude(s, 0.9, 0.35, 0.25);
  }, [w, h, bezel]);
  const glassGeo = useMemo(
    () => extrude(roundedRect(w, h, 1.4), 0.2, 0),
    [w, h],
  );
  // one material per Text instance: troika patches the material it is given
  const digits = useMemo(
    () =>
      new MeshBasicMaterial({
        color: DIGIT.clone().multiplyScalar(1.6),
        toneMapped: false,
        side: DoubleSide,
      }),
    [],
  );
  const text = useRef<{ text: string; sync: () => void } | null>(null);
  const last = useRef("");

  useFrame((_, dt) => {
    const live = power.get().desk; // unplugged: the display goes dark
    const t = live ? (motor.height / IN).toFixed(1) : "";
    if (t !== last.current && text.current) {
      last.current = t;
      text.current.text = t;
      text.current.sync();
    }
    // digits brighten while the motor runs
    const target = !live ? 0 : motor.velocity !== 0 ? 2.4 : 1.6;
    const c = digits.color;
    const k = Math.min(1, dt * 8);
    const base = DIGIT;
    c.r += (base.r * target - c.r) * k;
    c.g += (base.g * target - c.g) * k;
    c.b += (base.b * target - c.b) * k;
  });

  return (
    <group position={[x, 0, 0]}>
      <mesh
        geometry={bezelGeo}
        material={MAT.bezel}
        position={[0, 0, -0.35]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={glassGeo}
        material={MAT.glass}
        position={[0, 0, -0.1]}
        receiveShadow
      />
      <Text
        ref={text as never}
        position={[0, -0.3, 0.2]}
        font={PIXEL_FONT}
        fontSize={7}
        letterSpacing={0.04}
        anchorX="center"
        anchorY="middle"
        material={digits}
      >
        28.3
      </Text>
    </group>
  );
}
