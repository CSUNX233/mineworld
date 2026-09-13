"""Blender background build: pixel-textured reusable interactive props, metres, -Y front."""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/world/interaction-props'
ART=ROOT/'art/sunlit-world/interaction-props'
OUT.mkdir(parents=True,exist_ok=True); ART.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
# A small authored pixel palette, packed with the GLB, shared by every prop.
palette=[(155,103,49),(173,134,55),(34,53,72),(64,48,32),(198,188,158),(164,37,24),(34,108,155),(114,121,95)]
rng=random.Random(2301); pixels=[]
for y in range(64):
    for x in range(128):
        tile=x//32+(y//32)*4; base=palette[tile]
        # Wood clusters wider than they are high; other materials use square clusters.
        randomizer=random.Random(tile*10000+(x%32)//(4 if tile==0 else 2)*131+(y%32)//2*7919)
        v=randomizer.uniform(.86,1.12)
        pixels.extend([min(1,c*v/255) for c in base]+[1])
im=bpy.data.images.new('Interaction_pixel_palette',width=128,height=64)
im.pixels=pixels; im.filepath_raw=str(OUT/'pixel-palette.png'); im.file_format='PNG'; im.save(); im.pack()
mat=bpy.data.materials.new('Pixel_oak_navy_gold'); mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value=.87
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;tex.interpolation='Closest'
mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
parts=[]; modules={}
def surface(obj,tile):
    obj.data.materials.append(mat)
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new()
    # Box projection in local coordinates gives each face a legible pixel pattern.
    for poly in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i])); axes=[i for i in range(3) if i!=axis]
        coords=[obj.data.vertices[obj.data.loops[i].vertex_index].co for i in poly.loop_indices]
        low=[min(c[a] for c in coords) for a in axes]; span=[max(c[a] for c in coords)-low[j] for j,a in enumerate(axes)]
        for idx,c in zip(poly.loop_indices,coords):
            u=(c[axes[0]]-low[0])/max(span[0],.001);v=(c[axes[1]]-low[1])/max(span[1],.001)
            uv.data[idx].uv=((tile%4+(1+u*30)/32)/4,(tile//4+(1+v*30)/32)/2)
    parts.append(obj);return obj
def box(x,y,z,w,d,h,tile=0,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Broad_edge_bevel','BEVEL');m.width=bevel;m.segments=1;bpy.ops.object.modifier_apply(modifier=m.name)
    return surface(o,tile)
def beam(a,b,width,depth,tile=0):
    a,b=Vector(a),Vector(b);mid=(a+b)/2;o=box(*mid,width,depth,(b-a).length,tile)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def prism(x0,x1,profile,tile):
    verts=[(x,y,z) for x in [x0,x1] for y,z in profile];n=len(profile)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new('faceted_mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('faceted_part',mesh);bpy.context.collection.objects.link(o);return surface(o,tile)
def finish(name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:p.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);parts.clear();modules[name]=o;return o
def diamond(x,y,z,s=.07):
    o=box(x,y,z,s,.022,s,2);o.rotation_euler.y=math.pi/4
def crate(x,y,z,w=.4,d=.43,h=.4):
    box(x,y,z+h/2,w,d,h,3)
    for k in range(3):box(x,y-d/2-.006,z+(k+.5)*h/3,w-.025,.04,h/3-.01)
    for side in [-1,1]:
        box(x+side*(w/2-.025),y,z+h/2,.05,d+.025,h+.02)
        for zz in [.035,h-.035]:box(x+side*(w/2-.025),y-d/2-.034,z+zz,.065,.03,.07,2)
    beam((x-w*.4,y-d/2-.03,z+.035),(x+w*.4,y-d/2-.03,z+h-.035),.055,.025)
    beam((x+w*.4,y-d/2-.05,z+.035),(x-w*.4,y-d/2-.05,z+h-.035),.055,.025)
    box(x,y,z+h+.012,w,d,.04)
def potion(x,y,z,tile=5,s=1):
    box(x,y,z+.10*s,.15*s,.15*s,.18*s,tile,.02*s)
    box(x,y,z+.22*s,.075*s,.075*s,.065*s,1)
    box(x,y,z+.264*s,.09*s,.09*s,.026*s,0)
# Chest: real cavity, barrel lid shell, split latch, rear hinge at y=.4,z=.52.
box(0,0,.06,1.2,.8,.12)
box(0,0,.13,1.03,.64,.035,2)
for k in range(3):
    z=.15+(k+.5)*.12
    for y in [-.36,.36]:box(0,y,z,1.2,.08,.115)
    for x in [-.56,.56]:box(x,0,z,.08,.64,.115)
for y in [-.36,.36]:box(0,y,.505,1.2,.085,.045,2)
for x in [-.56,.56]:box(x,0,.505,.085,.72,.045,2)
for x in [-.55,.55]:
    for y in [-.35,.35]:
        for z in [.08,.46]:box(x,y,z,.16,.15,.13,1,.012)
box(0,-.411,.39,.16,.032,.2,1,.012);diamond(0,-.432,.40)
for x in [-.34,.34]:box(x,.413,.49,.12,.065,.12,3)
finish('chest_body')
outer=[(-.4,.52),(-.4,.61),(-.25,.75),(.25,.75),(.4,.61),(.4,.52)]
inner=[(-.35,.52),(-.35,.59),(-.23,.70),(.23,.70),(.35,.59),(.35,.52)]
# Side end caps and separate roof facets leave the underside hollow.
prism(-.6,-.55,outer,0);prism(.55,.6,outer,0)
for i in range(5):prism(-.55,.55,[outer[i],outer[i+1],inner[i+1],inner[i]],0)
for x in [-.40,0,.40]:
    for i in range(5):
        a,b=outer[i],outer[i+1];prism(x-.045,x+.045,[a,b,(b[0]*1.02,b[1]+.018),(a[0]*1.02,a[1]+.018)],1)
box(0,-.423,.535,.14,.028,.10,1);diamond(0,-.444,.55,.055)
for x in [-.34,.34]:box(x,.42,.55,.11,.07,.10,3)
finish('chest_lid')
# Rack frame, independent supply props merged for one draw call in repeated units.
for x in [-.62,.62]:
    for y in [-.25,.25]:
        box(x,y,.8,.14,.14,1.6,0,.008)
        for z in [.17,.83,1.47]:
            box(x,y,z,.155,.155,.095,2);box(x,y-.085,z,.042,.018,.04,1)
for z in [.14,.8,1.44]:box(0,0,z,1.4,.65,.10)
beam((-.59,.27,.22),(.59,.27,1.37),.08,.055)
beam((.59,.29,.22),(-.59,.29,1.37),.08,.055)
finish('rack_frame')
crate(-.31,0,.2,.49,.44,.48);crate(.31,0,.2,.49,.44,.48)
for x,z in [(-.37,.94),(-.16,.94),(-.29,1.11)]:
    box(x,-.06,z,.19,.27,.17,4,.025);box(x,-.06,z+.002,.06,.282,.178,2)
potion(.40,-.10,.85)
box(0,0,1.59,.53,.36,.23,2,.02)
box(0,0,1.715,.055,.37,.018,1);box(0,-.187,1.60,.055,.02,.23,1)
box(0,0,1.717,.54,.045,.018,1);box(0,-.20,1.60,.09,.03,.09,1)
finish('rack_supplies')
crate(0,0,0,.9,.85,.85);finish('supply_crate')
# Merchant: four posts, inclined canopy, counter panels, rear shelves and sign.
for x in [-1.28,1.28]:
    for y in [-.65,.65]:
        height=2.45 if y<0 else 2.70
        box(x,y,height/2,.16,.16,height)
        box(x,y,.12,.20,.20,.24,4,.012);box(x,y,height-.02,.21,.21,.20,1,.012)
box(0,-.47,.5,2.42,.49,.95)
box(0,-.49,1.0,2.53,.62,.10,0,.012)
for x in [-.79,0,.79]:
    box(x,-.721,.51,.65,.03,.69,2)
    for dx in [-.345,.345]:box(x+dx,-.741,.51,.045,.045,.79,1)
    for z in [.12,.90]:box(x,-.741,z,.73,.045,.05,1)
for z in [.52,1.44]:box(0,.47,z,2.38,.37,.09)
crate(-.78,.45,.06,.52,.40,.40)
for x,z,t in [(-.84,1.49,5),(-.61,1.49,6),(.6,1.49,1)]:potion(x,.46,z,t)
for x,t in [(-.9,5),(-.65,6),(-.4,1)]:potion(x,-.51,1.055,t)
box(.26,-.49,1.071,.39,.24,.035,4)
box(.9,-.48,1.075,.20,.16,.03,1);box(.9,-.48,1.28,.035,.035,.4,1)
box(.9,-.48,1.45,.36,.025,.027,1)
for x in [.75,1.05]:
    box(x,-.48,1.31,.012,.012,.26,1);box(x,-.48,1.185,.15,.15,.025,1)
prism(-1.4,1.4,[(-.85,2.39),(-.85,2.47),(.85,2.78),(.85,2.70)],2)
for x in [-1.33,1.33]:prism(x-.028,x+.028,[(-.86,2.47),(.86,2.78),(.86,2.801),(-.86,2.491)],1)
box(0,-.858,2.39,2.8,.038,.16,2);box(0,-.88,2.32,2.8,.02,.027,1)
box(0,-.884,2.39,.10,.023,.10,1);diamond(0,-.9,2.39,.045)
box(1.49,-.65,2.05,.47,.10,.10)
box(1.66,-.65,1.74,.04,.04,.53,1)
box(1.66,-.65,1.61,.32,.08,.39,1,.012);box(1.66,-.697,1.61,.26,.02,.32,2)
o=box(1.66,-.714,1.61,.105,.018,.105,1);o.rotation_euler.y=math.pi/4
finish('merchant_stall')
# Ancient waygate: same stone frame in both states, glow runes separate for runtime switching.
box(0,0,.08,2.4,.8,.16,4,.012)
for side in [-1,1]:
    x=side*.91
    for z,w,d,h in [(.22,.58,.72,.28),(.46,.46,.58,.2),(1.38,.40,.48,1.65),(2.27,.56,.60,.22)]:box(x,0,z,w,d,h,4,.009)
    for face in [-1,1]:
        box(x,face*.252,1.4,.27,.025,1.5,2)
        for dx in [-.16,.16]:box(x+dx,face*.278,1.4,.035,.035,1.6,1)
        for z in [.61,2.18]:box(x,face*.28,z,.37,.05,.055,1)
    # Recessed continuous arch backing closes seams between stepped facing stones.
    beam((side*.88,0,2.36),(0,0,3.24),.34,.44,4)
    for i in range(6):
        box(side*(.83-i*.166),0,2.43+i*.165,.34,.48,.32,4,.008)
o=box(0,-.275,2.99,.32,.09,.32,1,.009);o.rotation_euler.y=math.pi/4
o=box(0,-.332,2.99,.19,.025,.19,2);o.rotation_euler.y=math.pi/4
finish('portal_frame')
for x in [-.91,.91]:
    for face in [-1,1]:
        for z,flip in [(.98,1),(1.38,-1),(1.78,1)]:
            box(x-.06*flip,face*.279,z,.035,.024,.18,1)
            box(x,face*.279,z+.07,.15,.024,.035,1)
            box(x+.06*flip,face*.279,z+.015,.035,.024,.095,1)
finish('portal_runes')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'interaction-props.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='NONE')
stats={n:sum(len(p.vertices)-2 for p in o.data.polygons) for n,o in modules.items()}
(ART/'model-budget.json').write_text(json.dumps({'triangles':stats,'total':sum(stats.values()),'palette':[128,64],'chestHinge':[0,.52,-.4]},indent=2))
# Assembled comparison scene. Preserve original origin-aligned mesh parts in GLB.
for name,o in modules.items():
    if name.startswith('chest'):o.location.x=-2.6
    elif name.startswith('rack'):o.location.x=2.6
    elif name=='supply_crate':o.hide_render=True;o.hide_viewport=True
    elif name.startswith('portal'):o.location.x=5.5
lid=modules['chest_lid'];body=modules['chest_body']
for src in [body,lid]:
    c=src.copy();c.data=src.data.copy();bpy.context.collection.objects.link(c);c.location=(-2.6,-1.6,0)
    if src==lid:
        from mathutils import Matrix
        hinge=Vector((0,.4,.52));c.data.transform(Matrix.Translation(hinge)@Matrix.Rotation(math.radians(-105),4,'X')@Matrix.Translation(-hinge))
bpy.ops.object.camera_add(location=(7,-12,8));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=10
camera.rotation_euler=(Vector((0,0,1.1))-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(1,-4,7));bpy.context.object.data.energy=850;bpy.context.object.data.size=7
bpy.ops.object.light_add(type='SUN',location=(0,0,8));bpy.context.object.rotation_euler=(.35,-.4,-.3);bpy.context.object.data.energy=1.8
scene=bpy.context.scene;scene.world.color=(.35,.38,.43);scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.filepath=str(ART/'blender-assembled.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'interaction-props.blend'))
bpy.ops.render.render(write_still=True)
# Genuine orthographic renders from the finished meshes for reference comparison.
all_meshes=[o for o in scene.objects if o.type=='MESH']
for name, selected in [('chest',['chest_body','chest_lid']),('rack',['rack_frame','rack_supplies']),('merchant',['merchant_stall']),('portal',['portal_frame','portal_runes'])]:
    for o in all_meshes:o.hide_render=True
    for n in selected:modules[n].hide_render=False;modules[n].location=(0,0,0)
    centre=Vector((0,0,1.7 if name=='portal' else 1.35 if name=='merchant' else .8 if name=='rack' else .45))
    camera.data.ortho_scale=3.9 if name=='portal' else 3.6 if name=='merchant' else 2.1 if name=='rack' else 1.75
    scene.render.resolution_x=900;scene.render.resolution_y=900
    for view,offset in [('front',(0,-10,0)),('right',(10,0,0)),('top',(0,0,10))]:
        camera.location=centre+Vector(offset)
        camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(ART/f'{name}-{view}.png');bpy.ops.render.render(write_still=True)
print('INTERACTION_PROPS_READY',stats)
