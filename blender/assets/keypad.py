"""
FEZIBO keypad. Mounted under the front edge of the desktop, right of centre.

Reference photo: black rounded housing, control face tilted forward/down.
Left to right on the face: screen, three rounded-square preset buttons
labelled 1 2 3, then two triangular buttons (up, down) with chevrons inside.

Local frame: origin at the TOP of the housing (where it meets the desktop underside),
control face looks toward -X (the person at the desk). Width runs along Y.

Names the web side uses:
  keypad                   root empty (rotate this to tilt the face)
  keypadBody               housing
  keypadScreen             dark inset; the readout Text sits on it
  keypadPreset1/2/3        rounded square buttons
  keypadUp / keypadDown    triangle buttons
  keypadLabel*             label geometry, children of their button
"""
import math

import bpy

import brunostyle as bs

IN = 0.0254

SPEC = {
    "body":      (2.3 * IN, 7.0 * IN, 1.05 * IN),   # depth x, width y, height z
    "tilt_deg":  22.0,                               # face tilted to look up at you
    "screen":    (1.55 * IN, 0.62 * IN),             # width y, height z
    "screen_y":  2.35 * IN,
    "sq":        0.68 * IN,                          # preset button size
    "sq_ys":     (0.85 * IN, 0.05 * IN, -0.75 * IN),
    "tri_r":     0.44 * IN,                          # triangle circumradius
    "tri_ys":    (-1.72 * IN, -2.62 * IN),
    "proud":     0.16 * IN,                          # how far buttons stand off the face
}

C = {"body": "keypadBody", "screen": "display", "button": "buttonSilver", "label": "label"}


def _label_text(name, text, size, parent, mat, y, z, x):
    """Extruded text on a button face. Faces -X, reads left to right for the person at the desk."""
    bpy.ops.object.text_add(location=(x, y, z))
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = size
    t.data.extrude = 0.03 * IN
    t.data.align_x = "CENTER"
    t.data.align_y = "CENTER"
    t.rotation_euler = (math.radians(90), 0, math.radians(-90))
    bpy.ops.object.convert(target="MESH")
    t = bpy.context.active_object
    # bake the rotation into the vertices so the glyph faces -X no matter what parents it
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    t.name = name
    t.data.name = name
    t.data.materials.append(mat)
    bs.paint(t, C["label"])
    t.parent = parent
    return t


def _chevron(name, parent, mat, y, z, x, up):
    """Two short bars meeting in a point: ^ for up, v for down."""
    root = bs.empty(name, (x, y, z), parent)
    half_w = 0.17 * IN          # half width of the chevron
    h = 0.13 * IN               # apex height above the arm ends
    thick = 0.065 * IN
    apex = (0.0, h if up else -h)
    for i, ys in enumerate((-half_w, half_w)):
        end = (ys, -h if up else h)
        cy, cz = (apex[0] + end[0]) / 2, (apex[1] + end[1]) / 2
        dy, dz = end[0] - apex[0], end[1] - apex[1]
        length = math.hypot(dy, dz) + thick * 0.6
        # a box whose long axis is Y, spun about X so Y points along (dy, dz)
        ang = math.degrees(math.atan2(dz, dy))
        bs.box(f"{name}Arm{i}", (0.02 * IN, length, thick), (0, cy, cz), C["label"], mat, None, root,
               rotation_deg=(ang, 0, 0))
    return root


def build(mat, parent=None, location=(0, 0, 0)):
    s = SPEC
    bx, by, bz = s["body"]
    root = bs.empty("keypad", location, parent)
    # housing hangs below the origin; tilt the whole keypad so the face looks up at you
    root.rotation_euler = (0, math.radians(-s["tilt_deg"]), 0)

    body = bs.box("keypadBody", (bx, by, bz), (0, 0, -bz / 2), C["body"], mat, 0.09 * IN, root)
    face_x = -bx / 2
    zc = -bz / 2  # vertical centre of the face

    # screen: shallow inset, painted display-dark
    sw, sh = s["screen"]
    bs.box("keypadScreen", (0.06 * IN, sw, sh), (face_x + 0.01 * IN, s["screen_y"], zc), C["screen"], mat, None, root)
    # thin bezel line around the screen
    bs.box("keypadScreenBezel", (0.03 * IN, sw + 0.12 * IN, sh + 0.12 * IN), (face_x + 0.02 * IN, s["screen_y"], zc), "buttonAccent", mat, None, root)

    # preset buttons: rounded squares, standing proud of the face
    for i, y in enumerate(s["sq_ys"]):
        n = f"keypadPreset{i + 1}"
        bs.box(n, (s["proud"], s["sq"], s["sq"]), (face_x - s["proud"] / 2, y, zc), C["button"], mat, 0.1 * IN, root)
        # label in root space (same as the chevrons); the web side moves it with its button
        _label_text(f"keypadLabel{i + 1}", str(i + 1), 0.4 * IN, root, mat, y, zc, face_x - s["proud"] - 0.03 * IN)

    # up / down: triangular prisms with chevrons
    for name, y, up in (("keypadUp", s["tri_ys"][0], True), ("keypadDown", s["tri_ys"][1], False)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=s["tri_r"], depth=s["proud"],
                                            location=(face_x - s["proud"] / 2, y, zc),
                                            rotation=(0, math.radians(90), 0))
        t = bpy.context.active_object
        # a 3-gon cylinder's first vertex sits on +local X; after the Y rotation it points along -Z.
        # spin about the prism axis so one point faces up (▲) or down (▼)
        t.rotation_euler.rotate_axis("X", math.radians(90 if up else -90))
        t.name = name
        t.data.name = name
        t.data.materials.append(mat)
        bs.paint(t, C["button"])
        bs.bevel(t, 0.05 * IN, segments=3, angle_deg=20)
        t.parent = root
        # chevron lives in root space (the prism is rotated, so its local axes are unhelpful)
        _chevron(f"{name}Label", root, mat, y, zc + (0.02 * IN if up else -0.02 * IN), face_x - s["proud"] - 0.03 * IN, up)

    return root
