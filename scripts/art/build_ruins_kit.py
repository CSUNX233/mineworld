"""Rebuild with Blender --background --factory-startup --python this_file.
All objects are origin-aligned reusable modules; X/Y ground, Z up in Blender.
"""
import bpy, math, random, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/world/ruins-kit'
SOURCE = ROOT / 'art/sunlit-world/ruins-kit'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
image = bpy.data.images.load(str(SOURCE / 'material-atlas-source.png'))
image.scale(512,512)
image.filepath_raw = str(OUT / 'material-atlas.png')
image.file_format = 'PNG'
image.save()
image.pack()
floor_image=bpy.data.images.load(str(SOURCE/'paving-source.png'))
floor_image.scale(512,512)
floor_image.filepath_raw=str(OUT/'paving.png'); floor_image.file_format='PNG'; floor_image.save()
mat = bpy.data.materials.new('Sunlit_pixel_atlas')
mat.use_nodes = True
nodes = mat.node_tree.nodes
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .95
tex = nodes.new('ShaderNodeTexImage'); tex.image = image; tex.interpolation = 'Closest'
color = nodes.new('ShaderNodeVertexColor'); color.layer_name = 'Color'
mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
mat.node_tree.links.new(tex.outputs['Color'],mix.inputs[1])
mat.node_tree.links.new(color.outputs['Color'],mix.inputs[2])
mat.node_tree.links.new(mix.outputs[0],bsdf.inputs['Base Color'])
rng = random.Random(2301)
parts = []
def cube(loc, size, tile=0, tint=(1,1,1), rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object; obj.dimensions = size; obj.rotation_euler.z = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    # UV atlas quadrant, inset to avoid neighboring swatches at mip levels.
    offsets = [(0,.5),(.5,.5),(0,0),(.5,0)]
    ox,oy = offsets[tile]
    for uv in obj.data.uv_layers.active.data:
        uv.uv = (ox+.035+uv.uv.x*.43, oy+.035+uv.uv.y*.43)
    colors = obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for c in colors.data: c.color = (*tint,1)
    parts.append(obj)
    return obj
def stone(x,y,z,w,d,h,tone=1):
    v = rng.uniform(.93,1)*tone
    obj=cube((x,y,z),(w,d,h),0,(v,v,v))
    if w>.85 and h<.3:
        bevel=obj.modifiers.new('Chipped_light_catching_edges','BEVEL'); bevel.width=.018; bevel.segments=1
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj
def finish(name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj=bpy.context.object; obj.name=name
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    parts.clear()
    return obj
def courses(height, width=1, depth=1):
    # Recessed mortar closes real holes while keeping sculpted joints readable.
    cube((0,0,height/2),(width-.065,depth-.065,height),0,(.75,.72,.65))
    count=round(height/.4)
    for k in range(count):
        # Alternate joint direction, one visible seam per course.
        for j in [-1,1]:
            if k%2: stone(0,j*(depth/4+.0045),(k+.5)*height/count,width,depth/2-.009,height/count-.018)
            else: stone(j*(width/4+.0045),0,(k+.5)*height/count,width/2-.009,depth,height/count-.018)
courses(2)
stone(0,0,2.06,.99,.99,.14)
finish('wall')
courses(3.2)
stone(0,0,3.26,.99,.99,.14)
stone(-.23,0,3.51,.44,.94,.34)
finish('wall_high')
cube((0,0,1.065),(.036,.94,2.13),0,(.8,.77,.7))
finish('wall_joint')
courses(4.4,.78,.78)
for z,w,h in [(.13,.98,.26),(.4,.9,.18),(3.65,.91,.16),(4.42,.98,.23),(4.72,.8,.35),(4.95,.61,.12)]:
    stone(0,0,z,w,w,h)
finish('pillar')
courses(3.2,.9,.9)
stone(-.21,0,3.43,.44,.84,.44)
stone(.2,.11,3.29,.4,.58,.19)
stone(-.22,.13,3.72,.39,.5,.17)
finish('broken_pier')
# Arch spans a 3-unit opening; all stone stays above 3.7 units.
for side in [-1,1]:
    for k in range(4):
        stone(side*(1.34-k*.3),0,3.95+k*.28,.56,.72,.5)
        stone(side*(1.34-k*.3),0,4.30+k*.28,.59,.77,.31)
stone(0,0,5.04,.45,.83,.7)
stone(0,0,5.42,.65,.87,.23)
finish('arch')
# Flags carry modeled gold edging and a small stepped heraldic emblem.
cube((0,-.43,3.1),(.57,.06,1.72),1)
for x in [-.31,.31]: cube((x,-.475,3.1),(.055,.04,1.78),3)
cube((0,-.475,2.23),(.66,.04,.06),3)
cube((0,-.48,3.97),(.86,.08,.08),3)
for x,z,w,h in [(0,3.25,.07,.52),(0,3.28,.32,.065),(-.13,3.39,.065,.16),(.13,3.39,.065,.16),(0,2.97,.16,.07)]: cube((x,-.49,z),(w,.03,h),3)
finish('banner')
# Connected trailing vines, firmly attached to a two-unit wall face.
for strand in [-1,1]:
    for k in range(8):
        z=.15+k*.25; x=strand*.16+math.sin(k*.8+strand)*.08
        cube((x,-.49,z),(.038,.04,.27),2,(.65,.7,.55))
        cube((x+(-1 if k%2 else 1)*.065,-.535,z),(.2,.085,.26),2,(rng.uniform(.9,1.35),rng.uniform(1,1.3),.8))
finish('ivy')
for i in range(13):
    x,y=rng.uniform(-.32,.32),rng.uniform(-.32,.32)
    cube((x,y,rng.uniform(.13,.34)),(.25,.24,.25),2,(rng.uniform(.75,1.15),rng.uniform(.9,1.2),.8))
finish('shrub')
for i in range(7):
    x,y=rng.uniform(-.33,.33),rng.uniform(-.33,.33)
    h=rng.uniform(.13,.35)
    cube((x,y,h/2),(.055,.055,h),2)
    if i%2==0: cube((x,y,h),(.11,.11,.07),0,(1.1,1.0,.42))
finish('flowers')
cube((0,0,1.5),(.3,.3,3),0,(.38,.29,.19))
for i in range(14):
    cube((rng.uniform(-1.1,1.1),rng.uniform(-1.1,1.1),rng.uniform(2.5,4.3)),(rng.uniform(.8,1.5),rng.uniform(.8,1.5),rng.uniform(.6,1)),2,(rng.uniform(.65,1.2),rng.uniform(.85,1.2),.75))
finish('tree')
# Shallow moss apron stays in the blocked cell; broken edges avoid square hedge beds.
for i in range(7):
    cube((rng.uniform(-.35,.35),rng.uniform(-.35,.35),rng.uniform(.015,.045)),(rng.uniform(.2,.4),rng.uniform(.2,.4),.03),2,(rng.uniform(.85,1.15),1,.8))
finish('moss')
for i in range(5):
    x,y=rng.uniform(-.25,.25),rng.uniform(-.25,.25)
    stone(x,y,.055,rng.uniform(.09,.23),rng.uniform(.08,.2),rng.uniform(.04,.11),.9)
finish('rubble')
# Wall mounting faces Blender -Y, corresponding to runtime local -Z.
cube((0,-.47,0),(.22,.09,.5),3,(.7,.7,.7))
cube((0,-.64,-.06),(.075,.36,.075),3)
cube((0,-.8,.08),(.1,.1,.55),0,(.32,.22,.13))
cube((0,-.8,.35),(.23,.23,.12),3)
finish('wall_torch')
for i in range(8):
    angle=i*math.pi/4
    stone(math.cos(angle)*.37,math.sin(angle)*.37,.075,.2,.19,.15,.75)
cube((0,0,.13),(.58,.12,.12),0,(.3,.19,.1),.65)
cube((0,0,.2),(.58,.12,.12),0,(.3,.19,.1),-.65)
finish('campfire')
# Chapter room props. Bases fit one existing obstacle cell.
stone(0,0,.65,.98,.98,1.3)
cube((0,-.48,1.28),(.66,.09,1.02),1)
for x in [-.35,.35]: cube((x,-.54,1.28),(.06,.045,1.09),3)
cube((0,-.55,1.28),(.065,.04,.8),3)
stone(0,0,1.87,.92,.92,.25)
finish('shield_barricade')
cube((0,0,.65),(.94,.9,1.3),0,(.46,.31,.16))
for z in [.18,.65,1.15]: cube((0,-.46,z),(.96,.06,.07),3,(.6,.6,.6))
for x in [-.26,.26]:
    cube((x,0,1.7),(.07,.07,1.15),0,(.36,.25,.13))
    cube((x,0,2.22),(.2,.11,.3),3,(.85,.9,.94))
finish('weapon_rack')
stone(0,0,.5,.96,.96,1)
stone(0,0,1.07,.98,.98,.18)
cube((0,0,1.42),(.67,.62,.54),3,(.8,.8,.8))
cube((0,-.32,1.43),(.38,.04,.32),1)
stone(0,0,1.8,.81,.76,.22)
stone(0,0,1.96,.49,.6,.12)
finish('reliquary')
stone(0,0,.22,.96,.96,.44)
stone(0,0,.53,.85,.85,.18)
for x in [-.19,.19]: stone(x,0,1.02,.26,.32,.8)
stone(0,0,1.78,.74,.44,.85)
stone(0,0,2.44,.48,.48,.45)
stone(0,0,2.75,.57,.56,.18)
stone(.36,-.18,1.68,.22,.44,.85)
cube((-.4,0,1.8),(.055,.055,2.3),3,(.7,.7,.7))
cube((-.4,0,3.04),(.19,.13,.32),3)
finish('guardian_statue')
# Closed monumental facade: decorative only, installed outside walkable room bounds.
for x in [-2.45,2.45]:
    for k in range(16): stone(x,0,.22+k*.43,.91,1.3,.415)
    stone(x,0,7.05,1.12,1.55,.32)
    for dx in [-.35,.35]:stone(x+dx,0,7.45,.32,1.35,.5)
for x in [-1.6,-.8,0,.8,1.6]:
    stone(x,0,6.4,.78,1.05,.9)
    cube((x,0,2.8),(.12,.2,5.4),3,(.36,.4,.44))
for z in [1,3,5.1]:cube((0,0,z),(4.05,.24,.12),3,(.4,.4,.4))
stone(0,0,7.05,1.05,1.28,.65)
cube((0,-.65,6.99),(.34,.05,.42),3)
finish('king_gate')
# Low-cost broken silhouette and a fallen fragment used outside traversal space.
for i in range(5):stone((i-2)*.18,0,.14+i%2*.045,.23,.46,.27)
finish('fallen_fragment')
for k in range(4):
    cube(((-1 if k%2 else 1)*.12,.08*k,.4+k*.75),(3.25-k*.4,3-k*.35,.78),0,(.55+k*.035,.6+k*.035,.43+k*.035),(-1 if k%2 else 1)*.09)
cube((0,.1,3.025),(1.65,1.5,.07),2,(.85,1,.8))
finish('rock_terrace')
for k in range(11):stone(0,0,.4+k*.75,2.25,2.25,.73,.82)
stone(0,0,8.5,2.6,2.6,.25)
for x in [-.96,0,.96]:
    for y in [-.96,.96]:
        if x==.96 and y==.96:continue
        stone(x,y,8.95,.48,.48,.65)
cube((0,-1.13,5.6),(.37,.035,.86),1,(.5,.5,.5))
finish('distant_tower')
# Small fire basket: one mesh, modeled emissive-looking gold flame, no extra light.
stone(0,0,.22,.62,.62,.44)
cube((0,0,.49),(.72,.72,.1),3)
for x,y,z,w in [(0,0,.76,.2),(-.16,.04,.68,.14),(.16,-.08,.71,.12),(0,0,.96,.1)]:
    cube((x,y,z),(w,w,.28),0,(1.6,1.15,.3))
finish('brazier')
# Export every module together. Runtime extracts its mesh and shares it across instances.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'sunlit-ruins-kit.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='NONE',export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True)
stats={o.name:sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'}
(SOURCE/'module-budget.json').write_text(json.dumps({'triangles':stats,'total':sum(stats.values()),'atlas':512},indent=2))
print('RUINS_KIT_READY',stats)
# Editable library opens as a spaced contact sheet with room for the whole chapter kit.
library=sorted([o for o in bpy.context.scene.objects if o.type=='MESH'],key=lambda o:o.name)
rows=math.ceil(len(library)/4)
for i,obj in enumerate(library):
    obj.location=(i%4*5,i//4*7,0)
    obj['module_id']=obj.name
bpy.ops.object.camera_add(location=(28,-24,35+rows*2))
camera=bpy.context.object
from mathutils import Vector
camera.rotation_euler=(Vector((7.5,(rows-1)*3.5,2))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=max(29,rows*6)
bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(3,-4,18))
bpy.context.object.data.energy=2400; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=12
bpy.ops.object.light_add(type='SUN',location=(0,0,12))
bpy.context.object.rotation_euler=(.35,-.45,-.3); bpy.context.object.data.energy=2.2
scene=bpy.context.scene
scene.world.color=(.28,.32,.36)
scene.render.engine='CYCLES'; scene.cycles.samples=16
scene.render.resolution_x=1500; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(SOURCE/'blender-module-library.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'sunlit-ruins-kit.blend'))
bpy.ops.render.render(write_still=True)
