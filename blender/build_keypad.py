"""
Builds only the keypad, plus a short slab of desktop edge above it for context,
and exports public/models/keypad.glb.

    npm run blender:keypad
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "blender", "lib"))
sys.path.insert(0, os.path.join(ROOT, "blender", "assets"))

import brunostyle as bs  # noqa: E402
import keypad  # noqa: E402

IN = 0.0254


def main():
    bs.reset_scene()
    img = bs.build_palette_image(os.path.join(ROOT, "public", "textures", "palette.png"))
    mat = bs.palette_material(img)

    # a 14" wide piece of the maple top, 1" thick, so the keypad hangs from something
    slab = bs.empty("deskEdge")
    top = bs.box("deskTop", (8 * IN, 14 * IN, 1 * IN), (3.7 * IN, 0, 0.5 * IN), "maple", mat, 0.014, slab)
    bs.paint(top, "mapleDark", [p.index for p in top.data.polygons if abs(p.normal.z) < 0.5])

    keypad.build(mat, parent=slab, location=(1.15 * IN, 0, 0))

    glb = os.path.join(ROOT, "public", "models", "keypad.glb")
    bs.export_glb(glb)
    bs.save_blend(os.path.join(ROOT, "blender", "keypad.blend"))
    bs.report(glb)


if __name__ == "__main__":
    main()
