"""
Bakes Rina's room lighting with Cycles, the way Bruno's "My Room in 3D" is lit.

Input  (written by the page: window.__bakeExport(), see src/components/room/bake/exportBake.ts)
    blender/bake/in/room.glb    B#### meshes to bake, O#### occluders (block and bounce light only)
    blender/bake/in/room.json   which scene-graph path each name came from, the light positions
Output (read by the page, src/components/room/bake/Baked.tsx)
    public/bake/room.glb        the baked meshes with their lightmap UVs (local space, mm)
    public/bake/base.png        blue hour: the sky through the window and its bounce
    public/bake/lamp.png        the desk lamp alone
    public/bake/fairy.png       the string lights alone
    public/bake/room.json       scales for decoding the maps, and the name -> path table

Each map is irradiance only (light, no surface colour), so the page multiplies in the live
colours and can fade the lamp and the fairy lights in and out, like Bruno's night/desk/TV mix.
Maps are stored as 8-bit sRGB PNGs of (light / scale), so the GPU decodes them for free.

Run from the repo root:
    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python blender/bake_room.py -- [size] [samples]
"""
import bpy
import json
import math
import os
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN = os.path.join(ROOT, "blender", "bake", "in")
OUT = os.path.join(ROOT, "public", "bake")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SIZE = int(argv[0]) if len(argv) > 0 else 2048
SAMPLES = int(argv[1]) if len(argv) > 1 else 512

T0 = time.time()


def log(*a):
    print(f"[bake {time.time() - T0:6.1f}s]", *a, flush=True)


def srgb_to_linear(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def to_bl(p):
    """three.js room mm (Y up, -Z north) -> Blender metres (Z up)."""
    return (p[0] / 1000, -p[2] / 1000, p[1] / 1000)


# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
info = json.load(open(os.path.join(IN, "room.json")))
bpy.ops.import_scene.gltf(filepath=os.path.join(IN, "room.glb"))
baked = sorted([o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("B")], key=lambda o: o.name)
occl = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("O")]
log(f"imported: {len(baked)} to bake, {len(occl)} occluders")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            log("device", kind, gpus[0].name)
            break
    except Exception as e:  # noqa: BLE001
        log("no", kind, e)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 0
scene.cycles.transmission_bounces = 0
scene.cycles.sample_clamp_indirect = 8.0  # tames fireflies from the small bright bulbs
scene.render.bake.margin = 6
scene.render.bake.use_clear = True

# every surface: matte, its own colour (so bounce light is tinted right: a warm floor warms the walls)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Roughness"].default_value = 1.0
            n.inputs["Metallic"].default_value = 0.0
            if "Specular IOR Level" in n.inputs:
                n.inputs["Specular IOR Level"].default_value = 0.0

# ------------------------------------------------------------------ lightmap UVs
# Each object is unwrapped on its own (Blender's multi-object unwrap + pack silently produced a
# layout nothing could bake into), then packed into the atlas here with a simple shelf packer,
# every object scaled so all surfaces get the same texel density.
PAD = 4  # texels of gap around each object's block
rects = []
for o in baked:
    me = o.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="lightmap")
    for x in bpy.data.objects:
        x.select_set(x is o)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.03, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=0.02)  # fill its own square tightly
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = me.uv_layers[0].data
    a = np.empty(len(uv) * 2, np.float32)
    uv.foreach_get("uv", a)
    a = a.reshape(-1, 2)
    lo, hi = a.min(0), a.max(0)
    if float((hi - lo).min()) < 1e-4:  # the tight pack collapsed it: fall back to the plain unwrap
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.03, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        uv.foreach_get("uv", a.ravel())
        lo, hi = a.min(0), a.max(0)
        log("fallback unwrap for", o.name)
    # world-space area (metres²) vs its UV area: how big this object's block should be
    s = o.matrix_world.to_scale()[0]
    area = sum(p.area for p in me.polygons) * s * s
    uv_area = 0.0
    for p in me.polygons:
        idx = list(p.loop_indices)
        pts = a[idx]
        x, y = pts[:, 0], pts[:, 1]
        uv_area += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    k = math.sqrt(area / max(uv_area, 1e-12)) if uv_area > 1e-9 else 0.01  # metres per UV unit
    rects.append([o, a, lo, hi, k])

def layout(texels_per_m):
    """Shelf-pack every block; returns placements or None if it doesn't fit."""
    items = []
    for i, (o, a, lo, hi, k) in enumerate(rects):
        w = max(2, math.ceil((hi[0] - lo[0]) * k * texels_per_m)) + 2 * PAD
        h = max(2, math.ceil((hi[1] - lo[1]) * k * texels_per_m)) + 2 * PAD
        items.append((h, w, i))
    items.sort(reverse=True)
    x = y = shelf = 0
    place = {}
    for h, w, i in items:
        if w > SIZE:
            return None
        if x + w > SIZE:
            x, y, shelf = 0, y + shelf, 0
        if y + h > SIZE:
            return None
        place[i] = (x, y, w, h)
        x += w
        shelf = max(shelf, h)
    return place

_big = sorted(rects, key=lambda r: -max((r[3] - r[2]) * r[4]))[:3]
log("largest blocks (m):", [(r[0].name, [round(float(v), 3) for v in (r[3] - r[2]) * r[4]], round(float(r[4]), 3)) for r in _big])
lo_d, hi_d = 1.0, 2000.0  # texels per metre: find the densest layout that fits
best = None
for _ in range(30):
    mid = (lo_d + hi_d) / 2
    p = layout(mid)
    if p:
        best, lo_d = (mid, p), mid
    else:
        hi_d = mid
dens, place = best
for i, (o, a, lo, hi, k) in enumerate(rects):
    x, y, w, h = place[i]
    t = (a - lo) * k * dens  # texels
    t[:, 0] = (t[:, 0] + x + PAD) / SIZE
    t[:, 1] = (t[:, 1] + y + PAD) / SIZE
    o.data.uv_layers[0].data.foreach_set("uv", t.astype(np.float32).ravel())
log(f"uv: {len(rects)} objects unwrapped and packed at {dens:.0f} texels per metre")

# ------------------------------------------------------------------ bake target
img = bpy.data.images.new("lightmap", SIZE, SIZE, float_buffer=True, alpha=False)
img.colorspace_settings.name = "Non-Color"
plain = bpy.data.materials.new("plain")
plain.use_nodes = True
for o in baked:
    for slot in o.material_slots:
        if slot.material is None:  # an empty slot would make Blender cancel the whole bake, silently
            slot.material = plain
    for slot in o.material_slots:
        m = slot.material
        nodes = m.node_tree.nodes
        tex = nodes.get("BAKE_TARGET") or nodes.new("ShaderNodeTexImage")
        tex.name = "BAKE_TARGET"
        tex.image = img
        for n in nodes:
            n.select = False
        tex.select = True
        nodes.active = tex
    if not o.material_slots:
        o.data.materials.append(plain)
        nodes = plain.node_tree.nodes
        tex = nodes.get("BAKE_TARGET") or nodes.new("ShaderNodeTexImage")
        tex.name = "BAKE_TARGET"
        tex.image = img
        nodes.active = tex

# Blender bakes each selected object on its own and rebuilds the whole Cycles scene each time, so
# 185 objects meant 185 rebuilds per map. Bake ONE joined copy instead (the copies keep the packed
# lightmap UVs); the originals are hidden from rendering and exported afterwards.
for o in bpy.data.objects:
    o.select_set(o in baked)
bpy.context.view_layer.objects.active = baked[0]
bpy.ops.object.duplicate(linked=False)
copies = list(bpy.context.selected_objects)
bpy.context.view_layer.objects.active = copies[0]
bpy.ops.object.join()
bake_obj = bpy.context.view_layer.objects.active
bake_obj.name = "BAKE_ALL"
for o in baked:
    o.hide_render = True
log(f"joined {len(copies)} copies into one bake object")
log("bake_obj uv", [u.name for u in bake_obj.data.uv_layers], "polys", len(bake_obj.data.polygons), "mats", len(bake_obj.material_slots), "active nodes", sorted({(s.material.node_tree.nodes.active.name if s.material and s.material.node_tree.nodes.active else None) for s in bake_obj.material_slots}, key=str)[:5], "scale", tuple(bake_obj.matrix_world.to_scale()), "loc", tuple(bake_obj.matrix_world.translation), "dims", tuple(bake_obj.dimensions))

# ------------------------------------------------------------------ lights
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]

W = info["window"]
room = info["room"]


def make_window_light():
    """Blue hour through the glass: a soft area light filling the opening, just outside it."""
    d = bpy.data.lights.new("window", "AREA")
    d.shape = "RECTANGLE"
    d.size = (W["x1"] - W["x0"]) / 1000
    d.size_y = (W["head"] - W["sill"]) / 1000
    d.color = srgb_to_linear("#9fa8ee")
    d.energy = 60.0
    o = bpy.data.objects.new("window", d)
    cx = (W["x0"] + W["x1"]) / 2
    cy = (W["sill"] + W["head"]) / 2
    o.location = to_bl((cx, cy, W["z"] - 30))
    o.rotation_euler = (math.radians(-90), 0, 0)  # face into the room (Blender -Y)
    scene.collection.objects.link(o)
    return [o]


def make_lamp():
    L = info["lights"]["lamp"]
    d = bpy.data.lights.new("lamp", "POINT")
    d.shadow_soft_size = 0.012
    d.color = srgb_to_linear("#ffb877")
    d.energy = 30.0
    o = bpy.data.objects.new("lamp", d)
    o.location = to_bl(L["pos"])
    scene.collection.objects.link(o)
    return [o]


def make_fairy():
    out = []
    for i, p in enumerate(info["lights"]["fairy"]):
        d = bpy.data.lights.new(f"fairy{i}", "POINT")
        d.shadow_soft_size = 0.006
        d.color = srgb_to_linear("#ffcf8f")
        d.energy = 0.6
        o = bpy.data.objects.new(f"fairy{i}", d)
        o.location = to_bl(p)
        scene.collection.objects.link(o)
        out.append(o)
    return out


PASSES = {
    "base": (make_window_light, srgb_to_linear("#46508f"), 0.6),  # sky through the window
    "lamp": (make_lamp, (0, 0, 0), 0.0),
    "fairy": (make_fairy, (0, 0, 0), 0.0),
}

# coverage mask (which texels belong to a surface), for the denoise and the scale
def read(image):
    a = np.empty(SIZE * SIZE * 4, dtype=np.float32)
    image.pixels.foreach_get(a)
    return a.reshape(SIZE, SIZE, 4)


def bake_mask():
    # an occlusion bake writes something non-zero on every texel that belongs to a surface
    scene.cycles.samples = 4
    log("mask bake...")
    bpy.ops.object.bake(type="AO", margin=6)
    a = read(img)
    scene.cycles.samples = SAMPLES
    return (a[..., :3].sum(-1) > 1e-6).astype(np.float32)


for o in bpy.data.objects:
    o.select_set(o is bake_obj)
bpy.context.view_layer.objects.active = bake_obj

mask = bake_mask()
log(f"coverage {mask.mean() * 100:.1f}% of the atlas")


def blur(a, r):
    """Separable box-ish blur (3 passes of a box ~ gaussian), per channel."""
    k = 2 * r + 1
    out = a.copy()
    for _ in range(3):
        for axis in (0, 1):
            c = np.cumsum(np.pad(out, [(r + 1, r) if i == axis else (0, 0) for i in range(out.ndim)], mode="edge"), axis=axis)
            hi = np.take(c, range(k, k + out.shape[axis]), axis=axis)
            lo = np.take(c, range(0, out.shape[axis]), axis=axis)
            out = (hi - lo) / k
    return out


def denoise(rgb):
    """Normalised blur inside the surfaces only (never bleeding into empty atlas space)."""
    m = mask[..., None]
    num = blur(rgb * m, 2)
    den = blur(m, 2)
    sm = np.where(den > 1e-4, num / np.maximum(den, 1e-4), rgb)
    return np.where(m > 0, sm, rgb)


def save(rgb, name):
    lum = (rgb * np.array([0.2126, 0.7152, 0.0722])).sum(-1)
    vals = lum[mask > 0]
    scale = float(np.percentile(vals, 99.7)) * 1.15 if vals.size else 1.0
    scale = max(scale, 1e-6)
    x = np.clip(rgb / scale, 0, 1)
    enc = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    px = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    px[..., :3] = enc
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = os.path.join(OUT, name + ".png")
    out.file_format = "PNG"
    out.save()
    return scale


os.makedirs(OUT, exist_ok=True)
scales = {}
for name, (make, world_col, world_str) in PASSES.items():
    made = make()
    bg.inputs["Color"].default_value = (*world_col, 1)
    bg.inputs["Strength"].default_value = world_str
    t = time.time()
    log(f"{name}: baking...")
    r = bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=6)
    log("bake op:", r)
    log(f"{name}: baked, denoising")
    _r = read(img); log("raw max", float(_r[..., :3].max()), "mean", float(_r[..., :3].mean()), "nonzero%", float((_r[..., :3].sum(-1) > 1e-9).mean() * 100))
    a = read(img)[..., :3]
    scales[name] = save(denoise(a), name)
    log(f"{name}: baked in {time.time() - t:.1f}s, scale {scales[name]:.4f}")
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)

# ------------------------------------------------------------------ export the baked meshes with their UVs
for o in bpy.data.objects:
    o.select_set(o in baked)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "room.glb"),
    export_format="GLB",
    use_selection=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="NONE",
    export_yup=True,
    export_apply=False,
)
names = {e["name"]: e["path"] for e in info["entries"] if e["role"] == "bake"}
json.dump({"size": SIZE, "samples": SAMPLES, "scales": scales, "paths": names}, open(os.path.join(OUT, "room.json"), "w"), indent=1)
log("done ->", OUT)
