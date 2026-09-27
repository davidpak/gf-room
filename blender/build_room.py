"""
Builds Rina's room in Blender from the floor plan, in the shared "brunostyle"
look, then saves the .blend and exports a GLB for the web app.

Run (from the repo root):
    blender -b --python blender/build_room.py
or: npm run blender:room

Coordinates are Blender's: X right, Y depth (+Y = back wall), Z up, metres.
The glTF exporter converts to three.js Y-up, so Blender +Y becomes three.js -Z.

Naming: every asset has an EMPTY root (bed, desk, lamp ...) with its parts
parented underneath. The web side finds interactive things by root name.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "blender", "lib"))
sys.path.insert(0, os.path.join(ROOT, "blender", "assets"))

import brunostyle as bs  # noqa: E402
import desk_fezibo  # noqa: E402

W, D, H = 3.6, 3.2, 2.6        # room width (x), depth (y), height (z)
WALL = 0.12
BACK = D / 2                   # +Y
LEFT = -W / 2                  # -X


def shell(mat):
    root = bs.empty("shell")
    bs.box("floor", (W, D, 0.1), (0, 0, -0.05), "floor", mat, bevel_width=0.01, parent=root)

    # back wall (+Y) with a real hole for the window
    wy = BACK + WALL / 2
    bs.box("wallBackLeft", (1.3, WALL, H), (LEFT + 0.65, wy, H / 2), "wall", mat, None, root)
    bs.box("wallBackRight", (1.3, WALL, H), (W / 2 - 0.65, wy, H / 2), "wall", mat, None, root)
    bs.box("wallBackHeader", (1.0, WALL, 0.6), (0, wy, H - 0.3), "wall", mat, None, root)
    bs.box("wallBackSill", (1.0, WALL, 0.9), (0, wy, 0.45), "wall", mat, None, root)
    # window frame cross + sky card behind it
    bs.box("windowFrameV", (0.04, 0.05, 1.1), (0, wy, 0.9 + 0.55), "trim", mat, None, root)
    bs.box("windowFrameH", (1.0, 0.05, 0.04), (0, wy, 0.9 + 0.55), "trim", mat, None, root)
    bs.box("windowSillLedge", (1.1, 0.16, 0.03), (0, BACK - 0.02, 0.9), "trim", mat, 0.005, root)
    bs.box("sky", (1.0, 0.01, 1.1), (0, wy + 0.2, 0.9 + 0.55), "sky", mat, None, root)

    # left wall (-X)
    bs.box("wallLeft", (WALL, D + WALL, H), (LEFT - WALL / 2, 0, H / 2), "wall", mat, None, root)

    # baseboards
    bs.box("baseboardBack", (W, 0.04, 0.1), (0, BACK - 0.02, 0.05), "trim", mat, None, root)
    bs.box("baseboardLeft", (0.04, D, 0.1), (LEFT + 0.02, 0, 0.05), "trim", mat, None, root)
    return root


def bed(mat):
    # headboard against the left wall, bed runs along Y
    root = bs.empty("bed", (LEFT + 0.5, BACK - 1.15, 0))
    bs.box_on_floor("bedFrame", (1.0, 2.0, 0.4), (0, 0), 0.0, "wood", mat, bevel_width=0.03, parent=root)
    bs.box_on_floor("bedHeadboard", (0.06, 2.0, 1.1), (-0.48, 0), 0.0, "wood", mat, bevel_width=0.02, parent=root)
    bs.box_on_floor("bedMattress", (0.96, 1.96, 0.2), (0, 0), 0.4, "mattress", mat, bevel_width=0.05, parent=root)
    blanket = bs.box_on_floor("bedBlanket", (0.98, 1.2, 0.08), (0, -0.35), 0.6, "blanket", mat, bevel_width=0.035, parent=root)
    bs.paint_top(blanket, "blanketDark")
    bs.box_on_floor("bedPillow", (0.5, 0.4, 0.12), (-0.15, 0.7), 0.6, "pillow", mat, bevel_width=0.05, parent=root)
    bs.box_on_floor("bedPillowPink", (0.34, 0.3, 0.1), (0.2, 0.72), 0.6, "pink", mat, bevel_width=0.045, parent=root)
    return root


def desk(mat):
    # FEZIBO 48x24 standing desk against the right wall, long side along Y.
    # Built at sitting height; the web side lifts deskLift by up to desk_fezibo.travel().
    root, lift = desk_fezibo.build(mat, (W / 2 - desk_fezibo.SPEC["top_depth"] / 2 - 0.05, BACK - 0.9, 0))
    surface = next(o for o in lift.children if o.name == "deskSurface")

    # laptop (hers is pink) facing the chair on -X
    lap = bs.empty("laptop", (-0.05, -0.15, 0.0), surface)
    bs.box("laptopBase", (0.22, 0.32, 0.015), (0, 0, 0.0075), "pink", mat, 0.006, lap)
    screen = bs.box("laptopScreen", (0.012, 0.32, 0.22), (0.11, 0, 0.11), "pink", mat, 0.005, lap, rotation_deg=(0, -15, 0))
    faces = [p.index for p in screen.data.polygons if p.normal.x < -0.5]
    bs.paint(screen, "screen", faces)

    # stack of books
    bk = bs.empty("books", (0.1, 0.35, 0.0), surface)
    bs.box("book1", (0.22, 0.3, 0.035), (0, 0, 0.0175), "book1", mat, 0.006, bk)
    bs.box("book2", (0.2, 0.28, 0.03), (0.01, 0.01, 0.05), "book2", mat, 0.006, bk, rotation_deg=(0, 0, 6))
    bs.box("book3", (0.21, 0.29, 0.03), (-0.01, 0, 0.08), "book3", mat, 0.006, bk, rotation_deg=(0, 0, -4))

    # mug
    bs.cylinder("mug", 0.04, 0.09, (-0.15, 0.1, 0.045), "uwPurple", mat, verts=16, bevel_width=0.006, parent=surface)

    # lamp rides on the desk too
    lp = bs.empty("lamp", (0.15, 0.5, 0.0), surface)
    bs.cylinder("lampBase", 0.09, 0.02, (0, 0, 0.01), "metal", mat, bevel_width=0.006, parent=lp)
    bs.cylinder("lampStem", 0.012, 0.4, (0, 0, 0.2), "metal", mat, verts=12, bevel_width=None, parent=lp)
    bs.cone("lampShade", 0.16, 0.06, 0.18, (0, 0, 0.45), "lampShade", mat, parent=lp)
    bs.sphere("lampBulb", 0.035, (0, 0, 0.41), "lampGlow", mat, lp)
    return root


def chair(mat):
    root = bs.empty("chair", (W / 2 - 1.0, BACK - 1.1, 0))
    bs.cylinder("chairBase", 0.22, 0.04, (0, 0, 0.02), "metal", mat, bevel_width=0.008, parent=root)
    bs.cylinder("chairStem", 0.03, 0.42, (0, 0, 0.23), "metal", mat, verts=12, bevel_width=None, parent=root)
    bs.box_on_floor("chairSeat", (0.45, 0.45, 0.06), (0, 0), 0.42, "chair", mat, bevel_width=0.02, parent=root)
    bs.box_on_floor("chairBack", (0.05, 0.45, 0.5), (-0.2, 0), 0.45, "chair", mat, bevel_width=0.02, parent=root)
    return root


def closet(mat):
    root = bs.empty("closet", (LEFT + 0.3, -D / 2 + 0.4, 0))
    bs.box_on_floor("closetBody", (0.6, 0.8, 1.9), (0, 0), 0.0, "wood", mat, bevel_width=0.025, parent=root)
    bs.box("closetSeam", (0.005, 0.02, 1.7), (0.301, 0, 0.95), "woodDark", mat, None, root)
    bs.sphere("closetHandle", 0.025, (0.32, -0.12, 1.0), "brass", mat, root)
    return root


def rug(mat):
    root = bs.empty("rug", (0.1, -0.5, 0))
    r = bs.cylinder("rugDisc", 0.9, 0.012, (0, 0, 0.006), "rug", mat, verts=48, bevel_width=None, parent=root)
    bs.cylinder("rugInner", 0.6, 0.014, (0, 0, 0.007), "rugDark", mat, verts=48, bevel_width=None, parent=root)
    return root


def lamp(mat):
    root = bs.empty("lamp", (W / 2 - 0.45, BACK - 0.35, 0.76))
    bs.cylinder("lampBase", 0.09, 0.02, (0, 0, 0.01), "metal", mat, bevel_width=0.006, parent=root)
    bs.cylinder("lampStem", 0.012, 0.4, (0, 0, 0.2), "metal", mat, verts=12, bevel_width=None, parent=root)
    bs.cone("lampShade", 0.16, 0.06, 0.18, (0, 0, 0.45), "lampShade", mat, parent=root)
    bs.sphere("lampBulb", 0.035, (0, 0, 0.41), "lampGlow", mat, root)
    return root


def plant(mat):
    root = bs.empty("plant", (W / 2 - 0.3, -D / 2 + 0.35, 0))
    bs.cylinder("plantPot", 0.14, 0.26, (0, 0, 0.13), "pot", mat, verts=20, bevel_width=0.015, parent=root)
    bs.sphere("plantLeaf0", 0.2, (0, 0, 0.45), "plant", mat, root)
    bs.sphere("plantLeaf1", 0.15, (0.12, 0.05, 0.6), "plantDark", mat, root)
    bs.sphere("plantLeaf2", 0.14, (-0.1, -0.08, 0.58), "plant", mat, root)
    return root


def main():
    bs.reset_scene()
    palette_png = os.path.join(ROOT, "public", "textures", "palette.png")
    img = bs.build_palette_image(palette_png)
    mat = bs.palette_material(img)

    for build in (shell, bed, desk, chair, closet, rug, plant):
        build(mat)

    glb = os.path.join(ROOT, "public", "models", "room.glb")
    bs.export_glb(glb)
    bs.save_blend(os.path.join(ROOT, "blender", "room.blend"))
    bs.report(glb)


if __name__ == "__main__":
    main()
