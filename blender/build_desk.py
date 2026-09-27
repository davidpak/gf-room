"""
Builds just the FEZIBO desk (desk-first milestone) and exports public/models/desk.glb.

    npm run blender:desk
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "blender", "lib"))
sys.path.insert(0, os.path.join(ROOT, "blender", "assets"))

import brunostyle as bs  # noqa: E402
import desk_fezibo  # noqa: E402


def main():
    bs.reset_scene()
    img = bs.build_palette_image(os.path.join(ROOT, "public", "textures", "palette.png"))
    mat = bs.palette_material(img)

    desk_fezibo.build(mat, (0, 0, 0))

    glb = os.path.join(ROOT, "public", "models", "desk.glb")
    bs.export_glb(glb)
    bs.save_blend(os.path.join(ROOT, "blender", "desk.blend"))
    bs.report(glb)


if __name__ == "__main__":
    main()
