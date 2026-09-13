"""Reproducible Blender kits for floors 6-15, based on generated orthographic boards.
Blender X/Y ground, Z up, -Y front. Output origins stay local for instancing.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/sunlit-world/chapters-06-15-kit'
REF=ROOT/'art/sunlit-world/chapters-06-15-reference'
ART.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
for chapter in ['foundry','sanctum']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    out=ROOT/f'public/assets/world/{chapter}-kit';out.mkdir(parents=True,exist_ok=True)
    image=bpy.data.images.load(str(REF/f'{chapter}-atlas.png'));image.scale(512,512)
    image.filepath_raw=str(out/'atlas.png');image.file_format='PNG';image.save();image.pack()
    mat=bpy.data.materials.new(chapter+'_pixel_atlas');mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.92
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest'
    color=mat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
    mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    mat.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);mat.node_tree.links.new(color.outputs['Color'],mix.inputs[2]);mat.node_tree.links.new(mix.outputs[0],bsdf.inputs['Base Color'])
    parts=[];library={};foundry=chapter=='foundry'
    def surface(o,tile,tint):
        o.data.materials.append(mat)
        uv=o.data.uv_layers.active or o.data.uv_layers.new()
        for p in o.data.polygons:
            axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[a for a in range(3) if a!=axis]
            coords=[o.data.vertices[o.data.loops[i].vertex_index].co for i in p.loop_indices]
            low=[min(c[a] for c in coords) for a in axes];span=[max(c[a] for c in coords)-low[j] for j,a in enumerate(axes)]
            for i,c in zip(p.loop_indices,coords):
                u=(c[axes[0]]-low[0])/max(span[0],.001);v=(c[axes[1]]-low[1])/max(span[1],.001)
                uv.data[i].uv=((tile%2)*.5+.025+u*.44,(1-tile//2)*.5+.025+v*.44)
        colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for c in colors.data:c.color=(*tint,1)
        parts.append(o);return o
    def box(x,y,z,w,d,h,tile=1,tint=(1,1,1)):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return surface(o,tile,tint)
    def beam(a,b,w=.12,d=.12,tile=2):
        a,b=Vector(a),Vector(b);c=(a+b)/2;o=box(*c,w,d,(b-a).length,tile);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
    def cylinder(x,y,z,r,h,tile=2,top=None):
        bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r,radius2=r if top is None else top,depth=h,location=(x,y,z));return surface(bpy.context.object,tile,(1,1,1))
    def finish(name):
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:p.select_set(True)
        bpy.context.view_layer.objects.active=parts[0]
        if len(parts)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=name;bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);parts.clear();library[name]=o;return o
    def pillar(x=0,y=0,h=4.5):
        box(x,y,h/2,.68,.68,h)
        for z,w,hh in [(.15,.96,.3),(.42,.83,.13),(h-.22,.83,.12),(h,.96,.25)]:box(x,y,z,w,w,hh,2 if foundry and z>.3 else 1)
        if not foundry:
            for dx in [-.25,.25]:box(x+dx,y-.39,h*.5,.1,.15,h*.75,1,(1.13,1.13,1.09))
    def bell(x,y,z,r=.5,h=.9):
        # Hollow faceted bell shell and open mouth, not a solid capped cone.
        levels=[(-h/2,r),(0,r*.78),(h*.35,r*.51),(h*.5,r*.25)]
        verts=[]
        for zz,rr in levels:
            verts.extend((x+rr*math.cos(i*math.pi/4),y+rr*math.sin(i*math.pi/4),z+zz) for i in range(8))
        faces=[(j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i) for j in range(3) for i in range(8)]
        mesh=bpy.data.meshes.new('bell_shell');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('bell_part',mesh);bpy.context.collection.objects.link(o);surface(o,2,(1,1,1))
        cylinder(x,y,z-h/2,r*1.04,.10,2,top=r*1.04);box(x,y,z-h*.25,.12,.12,h*.75,3)
    def niche(z=0):
        box(0,-.495,z+1.05,.69,.022,1.25,3,(.55,.55,.55))
        for x in [-.38,.38]:box(x,-.53,z+1.1,.13,.14,1.5)
        for zz in [.36,1.81]:box(0,-.53,z+zz,.9,.16,.14)
        for x in [-.19,0,.19]:
            box(x,-.55,z+.61,.13,.1,.15,0);box(x,-.55,z+.46,.18,.11,.07,0)
    # Seam-free full-cell walls; joints are painted, no holes between instances.
    box(0,0,1.38,.96,.96,2.76)
    for row in range(6):
        for side in [-1,1]:
            if row%2:box(0,side*.251,(row+.5)*.46,1,.498,.447)
            else:box(side*.251,0,(row+.5)*.46,.498,1,.447)
    box(0,0,2.79,1,1,.10,3 if foundry else 0)
    for z in [.18,2.52]:box(0,0,z,1.012,1.012,.07,2 if foundry else 1)
    finish('wall')
    box(0,0,.25,1,1,.5);box(0,0,.52,1.01,1.01,.08,2 if foundry else 0);finish('plinth')
    pillar();finish('pillar')
    # Door jambs fit verified wall cells at +/-2, leaving a full three-cell opening.
    for x in [-2,2]:pillar(x,0,3.5)
    if foundry:
        box(0,0,3.55,4.2,.76,.46);box(0,-.4,3.56,3.25,.08,.19,2)
    else:
        for side in [-1,1]:
            for i in range(5):box(side*(1.75-i*.35),0,3.65+i*.22,.48,.72,.44,0)
    finish('arch')
    box(0,0,1.65,.07,.09,2.2,2);box(0,-.10,1.38,.61,.045,1.6,3)
    for x in [-.29,.29]:box(x,-.135,1.42,.032,.025,1.48,2)
    for x,h in [(-.22,.24),(-.07,.36),(.1,.2),(.24,.31)]:box(x,-.1,.47-h/2,.12,.047,h,3)
    box(0,-.14,1.55,.2,.018,.08,2);box(0,-.14,1.55,.07,.018,.3,2);finish('banner')
    # Lamp sits entirely on wall attachment, glow is separate and cheaply instanced.
    box(0,0,.1,.34,.25,.2,2);box(0,0,.69,.34,.25,.13,2)
    for x in [-.14,.14]:
        for y in [-.1,.1]:box(x,y,.4,.04,.04,.6,3)
    box(0,.16,.44,.08,.26,.08,3);finish('lamp')
    box(0,0,.4,.23,.15,.47,0);finish('lamp_glow')
    for x,y,w in [(-.2,.03,.23),(.14,-.17,.19),(.25,.2,.12),(-.27,-.19,.09)]:
        o=box(x,y,.045,w,w*.8,.085,1);o.rotation_euler.z=x*3
    finish('rubble')
    if foundry:
        # Pipe segment across one wall tile, matching neighbour endpoints.
        beam((-.51,-.54,2.05),(.51,-.54,2.05),.16,.16)
        for x in [-.39,.39]:box(x,-.54,2.05,.10,.24,.24,3)
        finish('pipe')
        for i in range(8):
            a=i*math.pi/4;b=(i+1)*math.pi/4
            beam((math.cos(a)*.26,-.64,2.05+math.sin(a)*.26),(math.cos(b)*.26,-.64,2.05+math.sin(b)*.26),.045,.045,2)
        beam((-.24,-.64,2.05),(.24,-.64,2.05),.04,.04);beam((0,-.64,1.81),(0,-.64,2.29),.04,.04)
        box(0,-.61,2.05,.10,.14,.10,2);finish('valve')
        cylinder(0,0,1,.44,1.65,3,top=.4)
        for z in [.22,1.57]:cylinder(0,0,z,.48,.14,2)
        cylinder(0,0,1.9,.27,.2,3,top=.18);box(0,-.42,1.02,.27,.06,.30,2);finish('tank')
        box(0,0,1.45,.56,.56,2.9,3)
        for z in [.12,.65,1.2,1.75,2.3,2.88]:box(0,0,z,.84,.84,.13,2)
        for x in [-.32,.32]:box(x,-.33,1.45,.065,.12,2.75,3)
        finish('coil')
        for z in [.91,1.46,2.01,2.57]:box(0,-.345,z,.49,.022,.32,0)
        finish('coil_glow')
        box(0,0,.14,.92,.88,.28,3)
        for a,b in [((-.42,-.3,.3),(0,-.3,2.15)),((.42,-.3,.3),(0,-.3,2.15)),((-.42,-.3,.3),(.42,-.3,.3))]:beam(a,b,.09,.09)
        box(0,.12,1.05,.1,.25,1.8,3);finish('prism')
        mesh=bpy.data.meshes.new('prism_face');mesh.from_pydata([(-.36,-.31,.35),(.36,-.31,.35),(0,-.31,1.97)],[],[(0,1,2)]);mesh.update()
        o=bpy.data.objects.new('prism_light',mesh);bpy.context.collection.objects.link(o);surface(o,0,(1,1,1));finish('prism_glow')
        for x in [-1.3,1.3]:pillar(x,0,3.4)
        box(0,0,3.36,2.8,.45,.28,2)
        for z in [2.55,2.75,2.95,3.15]:box(0,0,z,.095,.095,.18,3)
        beam((0,0,2.55),(.17,0,2.43),.075,.075,2);finish('hoist')
        box(0,0,1,.94,.94,2,3)
        for y in [-.475,.475]:
            box(0,y,1,.85,.04,1.8,2,(.65,.50,.40))
            beam((-.4,y,.14),(.4,y,1.86),.08,.04,3);beam((.4,y,.14),(-.4,y,1.86),.08,.04,3)
        finish('break_panel')
        for x in [-1.8,1.8]:pillar(x,0,5.5)
        box(0,.25,2.9,3.1,1.1,5.8,1)
        for z,w in [(5.1,3.8),(5.55,3.3),(6,2.8),(6.45,2.2)]:box(0,.1,z,w,1.25,.43,3)
        box(0,-.33,2.3,2.6,.07,2.7,3)
        for x in [-1.1,-.55,0,.55,1.1]:box(x,-.45,2.3,.13,.22,2.75,2)
        for z in [.8,3.8,4.15]:box(0,-.35,z,3.15,.35,.19,2)
        finish('furnace')
        box(0,-.382,2.3,2.5,.022,2.6,0);finish('furnace_glow')
        cylinder(0,0,3,.8,6,1)
        for z in [.22,3.0,5.8,6.3]:cylinder(0,0,z,.93,.28,3)
        box(0,-.79,3.9,.30,.02,1.6,2);finish('chimney')
        box(0,0,.01,.84,.84,.02,3)
        for x in [-.33,-.11,.11,.33]:box(x,0,.025,.035,.81,.014,2)
        finish('grate')
        for x in [-.76,.76]:pillar(x,0,3.2)
        box(0,0,3.14,1.9,.64,.32);box(0,-.06,1.38,1.16,.38,2.7,3)
        bell(0,-.30,2.83,.25,.43);finish('sealed_gate')
        box(0,-.264,1.30,.68,.018,1.85,0);finish('sealed_gate_glow')
    else:
        box(0,0,1.38,1,1,2.76);niche(.35);box(0,0,2.79,1,1,.10,0);finish('wall_niche')
        pillar(h=4.8);niche(.2);niche(2.1);finish('ossuary')
        box(0,0,.13,.94,.8,.26);box(0,0,.33,.8,.67,.14,0)
        o=box(0,.06,1.18,.62,.21,1.6,0);o.rotation_euler.x=-.12
        box(0,-.095,1.28,.42,.025,1.06,3)
        for i in range(5):box(0,-.118,.88+i*.16,.20+(i%2)*.08,.012,.025,2)
        finish('tablet')
        box(0,0,.30,.93,.94,.60);box(0,0,.67,.96,.96,.14,0)
        box(0,-.48,.35,.46,.02,.24,3);box(0,-.5,.35,.11,.02,.09,2);finish('tomb')
        for z,w,h in [(.08,1.2,.16),(.23,1.0,.14),(.36,.8,.12)]:box(0,0,z,w,w,h)
        box(0,0,.433,.63,.63,.025,3)
        for x in [-.20,.20]:box(x,0,.45,.035,.46,.015,2)
        box(0,0,.45,.45,.04,.015,2);finish('altar')
        for x in [-1.25,1.25]:pillar(x,0,4.9)
        box(0,0,4.86,2.7,.48,.32,1)
        for z in [4.0,4.22,4.44,4.66]:box(0,0,z,.10,.10,.18,2)
        bell(0,0,3.4,.65,1.05);finish('bell_gantry')
        bell(0,0,.66,.57,1);finish('broken_bell')
        for x in [-2.2,2.2]:pillar(x,0,6.3)
        for side in [-1,1]:
            for i in range(6):box(side*(1.94-i*.35),0,5.9+i*.27,.54,.9,.53,0)
        for z in [5.2,5.5,5.8,6.1,6.4]:box(0,0,z,.13,.13,.22,2)
        bell(0,0,4.35,1.12,1.75)
        box(0,-.45,.16,2.2,1.5,.32);box(0,-.4,.55,1.2,.8,.6)
        box(0,.1,1.45,1.18,.27,2.0,3)
        for x in [-.66,.66]:box(x,-.35,1.0,.16,.85,1.2,0)
        finish('throne')
        for z,w in [(0.5,1.7),(1.5,1.4),(2.5,1.1)]:box(0,0,z,w,w,1,1)
        finish('rock')
        box(0,0,.006,.74,.74,.012,3);finish('puddle')
    # Export only library originals; glow material assigned separately at runtime.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out/'kit.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='NONE',export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True)
    stats={n:sum(len(p.vertices)-2 for p in o.data.polygons) for n,o in library.items()}
    (ART/f'{chapter}-budget.json').write_text(json.dumps({'modules':stats,'triangles':sum(stats.values())},indent=2))
    # Editable collection and three genuine orthographic comparison renders.
    for i,(n,o) in enumerate(library.items()):o.location=(i%5*6,i//5*8,0)
    centre=Vector((12,(math.ceil(len(library)/5)-1)*4,1.8))
    bpy.ops.object.camera_add(location=centre+Vector((22,-28,30)));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=48
    camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler();scene=bpy.context.scene;scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=(8,-4,22));bpy.context.object.data.energy=1800;bpy.context.object.data.size=18
    bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.3,-.5,-.3);bpy.context.object.data.energy=2
    scene.world.color=(.35,.37,.4);scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ART/f'{chapter}-library.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/f'{chapter}-kit.blend'));bpy.ops.render.render(write_still=True)
    for key in (['tank','coil','furnace','hoist'] if foundry else ['wall_niche','bell_gantry','throne','tablet']):
        for o in library.values():o.hide_render=True
        o=library[key];o.hide_render=False;o.location=(0,0,0)
        centre=Vector((0,0,o.dimensions.z/2));camera.data.ortho_scale=max(o.dimensions)*1.2
        scene.render.resolution_x=720;scene.render.resolution_y=720
        for view,offset in [('front',(0,-15,0)),('right',(15,0,0)),('top',(0,0,15))]:
            camera.location=centre+Vector(offset);camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(ART/f'{chapter}-{key}-{view}.png');bpy.ops.render.render(write_still=True)
    print('CHAPTER_KIT_READY',chapter,stats)
