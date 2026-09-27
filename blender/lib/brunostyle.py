"""
brunostyle: a tiny style library so EVERY asset in this project shares one look.

The look (borrowed from bruno-simon.com / folio-2025):
  * one shared PALETTE texture, every face's UVs collapsed onto a colour swatch
    -> the whole room is a single material, colours are edited in one place
  * low-poly primitives with a BEVEL modifier + hardened normals
    -> soft, toy-like edges that catch the light
  * flat colour, roughness 1, no textures other than the palette
  * naming conventions on objects so the web side can find things

Runs inside Blender's bundled Python (no pip needed):
  blender -b --python blender/build_room.py
"""
from __future__ import annotations

import math
import os
from typing import Iterable

import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------------------
# Palette: name -> hex. Edit colours here and every asset updates on rebuild.
# Keep it small: Bruno's whole world is a handful of swatches.
# ---------------------------------------------------------------------------
PALETTE: dict[str, str] = {
    "floor":       "#c9a27a",
    "wall":        "#f3ebe0",
    "trim":        "#ffffff",
    "wood":        "#8b5e3c",
    "woodDark":    "#5d3d26",
    "woodLight":   "#b07d52",
    "mattress":    "#fbf7f0",
    "blanket":     "#8fa6c8",
    "blanketDark": "#6f88ad",
    "pillow":      "#ffffff",
    "rug":         "#d98f76",
    "rugDark":     "#c47a62",
    "lampShade":   "#ffe3b3",
    "lampGlow":    "#ffd08a",
    "metal":       "#3a3a3a",
    "metalLight":  "#d9d9d9",
    "chair":       "#4d5a6b",
    "brass":       "#d9c27a",
    "sky":         "#ffd6a3",
    "screen":      "#1e2430",
    "plant":       "#6a9a5b",
    "plantDark":   "#4c7a41",
    "pot":         "#c8785a",
    "book1":       "#d96b6b",
    "book2":       "#6bb0d9",
    "book3":       "#e0c46b",
    "paper":       "#fdfaf2",
    "pink":        "#f3b6c8",
    "uwPurple":    "#4b2e83",
    "uwGold":      "#b7a57a",
    "maple":       "#e3c39a",
    "mapleDark":   "#c9a678",
    "frameBlack":  "#2a2a2e",
    "frameWhite":  "#f4f2ee",
    "keypadBody":  "#2b2d33",
    "display":     "#0d1117",
    "buttonAccent": "#3d4048",
    "floorNight":  "#5a4a7a",
    "buttonSilver": "#d3d5d9",
    "label":       "#15161a",
}

GRID = 8            # 8x8 swatches
CELL = 8            # px per swatch -> 64x64 palette image
PALETTE_IMAGE_NAME = "palette"
MATERIAL_NAME = "Palette"

_names = list(PALETTE.keys())


def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def swatch_uv(name: str) -> tuple[float, float]:
    """UV coordinate of the centre of a swatch."""
    if name not in PALETTE:
        raise KeyError(f"unknown palette colour '{name}'. Add it to PALETTE.")
    i = _names.index(name)
    col, row = i % GRID, i // GRID
    return ((col + 0.5) / GRID, 1.0 - (row + 0.5) / GRID)


# ---------------------------------------------------------------------------
# Palette image + shared material
# ---------------------------------------------------------------------------
def build_palette_image(png_path: str) -> bpy.types.Image:
    size = GRID * CELL
    img = bpy.data.images.get(PALETTE_IMAGE_NAME)
    if img is None:
        img = bpy.data.images.new(PALETTE_IMAGE_NAME, size, size, alpha=False)
    pixels = [0.0] * (size * size * 4)
    for i, name in enumerate(_names):
        col, row = i % GRID, i // GRID
        # Byte images keep pixel values as-is in the file's colour space (sRGB),
        # so write the hex values straight through. three.js reads the map as sRGB.
        r, g, b = _hex_to_rgb(PALETTE[name])
        for y in range(CELL):
            py = size - 1 - (row * CELL + y)
            for x in range(CELL):
                px = col * CELL + x
                idx = (py * size + px) * 4
                pixels[idx:idx + 4] = (r, g, b, 1.0)
    img.pixels = pixels
    img.filepath_raw = png_path
    img.file_format = "PNG"
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    img.save()
    return img


def palette_material(img: bpy.types.Image) -> bpy.types.Material:
    mat = bpy.data.materials.get(MATERIAL_NAME)
    if mat is None:
        mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"  # swatches, never blend between colours
    bsdf.inputs["Roughness"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    out.location = (400, 0)
    bsdf.location = (100, 0)
    tex.location = (-300, 0)
    return mat


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------
def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"


def paint(obj: bpy.types.Object, color: str, faces: Iterable[int] | None = None) -> None:
    """Collapse the UVs of the given faces (default: all) onto one swatch."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    u, v = swatch_uv(color)
    target = set(faces) if faces is not None else None
    for poly in me.polygons:
        if target is not None and poly.index not in target:
            continue
        for li in poly.loop_indices:
            uv[li].uv = (u, v)


def bevel(obj: bpy.types.Object, width: float = 0.02, segments: int = 3, angle_deg: float = 30.0) -> None:
    """Soft toy edges. Hardened normals keep the big faces flat, so no smoothing artefacts."""
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle_deg)
    mod.harden_normals = True
    mod.miter_outer = "MITER_ARC"
    # Smooth shading + hardened normals = flat faces with rounded corners
    for poly in obj.data.polygons:
        poly.use_smooth = True


def _finish(obj: bpy.types.Object, name: str, color: str, mat: bpy.types.Material,
            bevel_width: float | None, parent: bpy.types.Object | None) -> bpy.types.Object:
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    paint(obj, color)
    if bevel_width:
        bevel(obj, bevel_width)
    if parent is not None:
        obj.parent = parent
    return obj


def box(name: str, size: tuple[float, float, float], location: tuple[float, float, float],
        color: str, mat: bpy.types.Material, bevel_width: float | None = 0.02,
        parent: bpy.types.Object | None = None, rotation_deg: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    """Axis-aligned box. `location` is the CENTRE, sizes are full extents (metres)."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location,
                                    rotation=tuple(math.radians(a) for a in rotation_deg))
    obj = bpy.context.active_object
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(obj, name, color, mat, bevel_width, parent)


def box_on_floor(name: str, size: tuple[float, float, float], xy: tuple[float, float], z0: float,
                 color: str, mat: bpy.types.Material, **kw) -> bpy.types.Object:
    """Box whose bottom sits at z0 (easier to stack furniture than centre coords)."""
    return box(name, size, (xy[0], xy[1], z0 + size[2] / 2), color, mat, **kw)


def cylinder(name: str, radius: float, depth: float, location: tuple[float, float, float],
             color: str, mat: bpy.types.Material, verts: int = 24, bevel_width: float | None = 0.01,
             parent: bpy.types.Object | None = None, rotation_deg: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=location,
                                        rotation=tuple(math.radians(a) for a in rotation_deg))
    obj = bpy.context.active_object
    return _finish(obj, name, color, mat, bevel_width, parent)


def cone(name: str, r1: float, r2: float, depth: float, location: tuple[float, float, float],
         color: str, mat: bpy.types.Material, verts: int = 24, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=location)
    obj = bpy.context.active_object
    return _finish(obj, name, color, mat, None, parent)


def sphere(name: str, radius: float, location: tuple[float, float, float], color: str,
           mat: bpy.types.Material, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = bpy.context.active_object
    obj = _finish(obj, name, color, mat, None, parent)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def empty(name: str, location: tuple[float, float, float] = (0, 0, 0),
          parent: bpy.types.Object | None = None) -> bpy.types.Object:
    """Group root. The web side looks these up by name to attach interactions."""
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    obj = bpy.context.active_object
    obj.name = name
    if parent is not None:
        obj.parent = parent
    return obj


def paint_top(obj: bpy.types.Object, color: str) -> None:
    """Recolour only the upward-facing faces (e.g. blanket top, rug pattern)."""
    up = [p.index for p in obj.data.polygons if p.normal.z > 0.9]
    paint(obj, color, up)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
def export_glb(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,          # bake bevel modifiers into the mesh
        export_yup=True,            # Blender Z-up -> three.js Y-up
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        use_selection=False,
    )


def save_blend(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)


def report(glb_path: str) -> None:
    tris = 0
    for o in bpy.data.objects:
        if o.type == "MESH":
            ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
            me = ev.to_mesh()
            tris += sum(len(p.vertices) - 2 for p in me.polygons)
            ev.to_mesh_clear()
    size_kb = os.path.getsize(glb_path) / 1024 if os.path.exists(glb_path) else 0
    print(f"[brunostyle] objects={len(bpy.data.objects)} triangles={tris} glb={size_kb:.0f} KB")
