"""
FEZIBO Standing Desk, 47.2 x 23.6 in, electric height adjustable, maple top, WHITE frame.
Numbers from the product dimension sheet (inches -> metres).

Hierarchy (names matter, the web side animates them):
  desk                       root empty
    deskBase                 static: two T feet, foot pads, LOWER column stage
    deskLift                 moves: upper column stage, crossbar, motor, brackets,
                             top, hooks, keypad (display + 4 buttons), deskSurface
      deskSurface            empty at the top surface; things on the desk parent here

Long axis (47.2") runs along Blender Y, depth (23.6") along X.
Front of the desk (where you sit) faces -X.
"""
import math

import brunostyle as bs

IN = 0.0254

SPEC = {
    "top_length":   47.2 * IN,   # Y
    "top_depth":    23.6 * IN,   # X
    "top_thick":    1.0 * IN,
    "height_min":   28.3 * IN,   # floor -> top surface
    "height_max":   46.5 * IN,
    "feet_spacing": 31.6 * IN,   # centre to centre, along Y
    "foot_length":  22.5 * IN,   # along X
    "foot_width":   2.4 * IN,
    "foot_height":  1.3 * IN,
    "col_lower":    (2.75 * IN, 2.35 * IN),
    "col_upper":    (2.25 * IN, 1.85 * IN),
    "col_lower_h":  22.0 * IN,   # lower stage, above the foot
    "beam":         (2.4 * IN, 1.6 * IN),  # crossbar section (x, z)
    "motor_box":    (3.2 * IN, 3.0 * IN, 4.6 * IN),  # single motor on the right column
    "keypad":       (2.4 * IN, 6.2 * IN, 0.55 * IN),  # (x depth, y length, z thick)
    "hook_r":       0.9 * IN,
}

C = {
    "top":      "maple",
    "topEdge":  "mapleDark",
    "frame":    "frameWhite",
    "pad":      "metal",
    "keypad":   "keypadBody",
    "display":  "display",
    "button":   "keypadBody",
    "buttonUp": "buttonAccent",
}


def _hook(name, loc, parent, mat):
    """Curved bag/headphone hook hanging off the underside near one end."""
    r = SPEC["hook_r"]
    root = bs.empty(name, loc, parent)
    # short vertical stem from the underside
    bs.cylinder(f"{name}Stem", 0.22 * IN, 1.4 * IN, (0, 0, -0.7 * IN), C["frame"], mat, verts=10, bevel_width=None, parent=root)
    # half torus, opening upward, hanging below the stem
    import bpy
    bpy.ops.mesh.primitive_torus_add(major_segments=16, minor_segments=8, major_radius=r, minor_radius=0.22 * IN,
                                     location=(0, r, -1.4 * IN), rotation=(0, math.radians(90), 0))
    t = bpy.context.active_object
    # cut away the upper half (keep z <= 0 relative to torus centre): delete verts above
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(t.data)
    up = [v for v in bm.verts if v.co.z > 0.05 * IN]
    bmesh.ops.delete(bm, geom=up, context="VERTS")
    bm.to_mesh(t.data)
    bm.free()
    t.name = f"{name}Curve"
    t.data.name = t.name
    t.data.materials.append(mat)
    bs.paint(t, C["frame"])
    for p in t.data.polygons:
        p.use_smooth = True
    t.parent = root
    return root


def build(mat, location, height=None):
    s = SPEC
    h = height if height is not None else s["height_min"]
    h = max(s["height_min"], min(s["height_max"], h))
    top_under = h - s["top_thick"]

    root = bs.empty("desk", location)
    base = bs.empty("deskBase", (0, 0, 0), root)
    lift = bs.empty("deskLift", (0, 0, 0), root)

    ys = (-s["feet_spacing"] / 2, s["feet_spacing"] / 2)
    for i, y in enumerate(ys):
        # T foot with rounded ends + black levelling pads
        bs.box_on_floor(f"deskFoot{i}", (s["foot_length"], s["foot_width"], s["foot_height"]), (0, y), 0.2 * IN,
                        C["frame"], mat, bevel_width=0.012, parent=base)
        for j, x in enumerate((-s["foot_length"] / 2 + 1.2 * IN, s["foot_length"] / 2 - 1.2 * IN)):
            bs.cylinder(f"deskPad{i}{j}", 0.7 * IN, 0.25 * IN, (x, y, 0.12 * IN), C["pad"], mat, verts=12, bevel_width=None, parent=base)
        # lower column stage
        lx, ly = s["col_lower"]
        bs.box_on_floor(f"deskColumnLower{i}", (lx, ly, s["col_lower_h"]), (0, y), s["foot_height"] + 0.2 * IN,
                        C["frame"], mat, bevel_width=0.004, parent=base)
        # upper stage hangs from the lift, long enough to stay inside the lower stage at min height
        ux, uy = s["col_upper"]
        upper_len = s["col_lower_h"] - 1.5 * IN
        bs.box(f"deskColumnUpper{i}", (ux, uy, upper_len), (0, y, top_under - s["beam"][1] - upper_len / 2 + 1.0 * IN),
               C["frame"], mat, 0.003, lift)
        # bracket plate under the top at each column
        bs.box(f"deskBracket{i}", (s["top_depth"] * 0.72, 1.8 * IN, 0.7 * IN), (0, y, top_under - 0.35 * IN),
               C["frame"], mat, 0.003, lift)

    # crossbar between the columns
    bx, bz = s["beam"]
    bs.box("deskBeam", (bx, s["feet_spacing"] - s["col_lower"][1], bz), (0, 0, top_under - 0.7 * IN - bz / 2),
           C["frame"], mat, 0.003, lift)
    # single motor housing on the right column (+Y), just under the beam
    mx, my, mz = s["motor_box"]
    bs.box("deskMotor", (mx, my, mz), (0, ys[1] - my / 2 - 1.2 * IN, top_under - 0.7 * IN - bz - mz / 2 + 0.2 * IN),
           C["frame"], mat, 0.004, lift)

    # maple top with darker rounded edge
    top = bs.box("deskTop", (s["top_depth"], s["top_length"], s["top_thick"]), (0, 0, top_under + s["top_thick"] / 2),
                 C["top"], mat, 0.014, lift)
    bs.paint(top, C["topEdge"], [p.index for p in top.data.polygons if abs(p.normal.z) < 0.5])

    # hooks under each end, near the front
    _hook("hookLeft", (-s["top_depth"] / 2 + 5.5 * IN, -s["top_length"] / 2 + 1.6 * IN, top_under), lift, mat)
    _hook("hookRight", (-s["top_depth"] / 2 + 5.5 * IN, s["top_length"] / 2 - 1.6 * IN, top_under), lift, mat)

    # keypad: flush under the front edge, right of centre. Front face is -X.
    kx, ky, kz = s["keypad"]
    kp = (-s["top_depth"] / 2 + kx / 2 + 0.3 * IN, s["top_length"] * 0.18, top_under - kz / 2)
    bs.box("keypad", (kx, ky, kz), kp, C["keypad"], mat, 0.002, lift)
    face_x = kp[0] - kx / 2  # front face
    # display + four buttons proud of the front face
    bs.box("keypadDisplay", (0.12 * IN, 1.5 * IN, 0.38 * IN), (face_x - 0.05 * IN, kp[1] - 2.0 * IN, kp[2]),
           C["display"], mat, None, lift)
    labels = (("keypadPreset1", -0.65), ("keypadPreset2", 0.15), ("keypadUp", 0.95), ("keypadDown", 1.75))
    for name, dy in labels:
        col = C["buttonUp"] if name in ("keypadUp", "keypadDown") else C["button"]
        bs.box(name, (0.22 * IN, 0.62 * IN, 0.38 * IN), (face_x - 0.1 * IN, kp[1] + dy * IN, kp[2]), col, mat, 0.0015, lift)

    bs.empty("deskSurface", (0, 0, h), lift)
    return root, lift


def travel():
    return SPEC["height_max"] - SPEC["height_min"]
