"""Blender late-chapter kits. Real reusable meshes, pixel atlas, accurate orthographic renders."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/sunlit-world/chapters-16-25-kit';ART.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
for chapter in ['abyss','citadel']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    out=ROOT/f'public/assets/world/{chapter}-kit';out.mkdir(parents=True,exist_ok=True)
    image=bpy.data.images.load(str(ROOT/f'art/sunlit-world/chapters-16-25-reference/{chapter}-atlas.png'))
    image.scale(512,512);image.filepath_raw=str(out/'atlas.png');image.file_format='PNG';image.save();image.pack()
    mat=bpy.data.materials.new(chapter+'_pixel');mat.use_nodes=True
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest'
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.8
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    parts=[];library={};abyss=chapter=='abyss'
    def surface(o,tile=1):
        o.data.materials.append(mat);uv=o.data.uv_layers.active or o.data.uv_layers.new()
        for p in o.data.polygons:
            axes=[i for i in range(3) if i!=max(range(3),key=lambda j:abs(p.normal[j]))]
            coords=[o.data.vertices[o.data.loops[i].vertex_index].co for i in p.loop_indices]
            low=[min(c[a] for c in coords) for a in axes];span=[max(c[a] for c in coords)-low[j] for j,a in enumerate(axes)]
            for i,c in zip(p.loop_indices,coords):
                u=(c[axes[0]]-low[0])/max(.001,span[0]);v=(c[axes[1]]-low[1])/max(.001,span[1])
                uv.data[i].uv=((tile%2)*.5+.025+u*.44*span[0]/max(.001,max(span)),(1-tile//2)*.5+.025+v*.44*span[1]/max(.001,max(span)))
        col=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for c in col.data:c.color=(1,1,1,1)
        parts.append(o);return o
    def box(x,y,z,w,d,h,tile=1,bevel=0):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        if bevel:
            m=o.modifiers.new('carved_edges','BEVEL');m.width=bevel;m.segments=1;bpy.ops.object.modifier_apply(modifier=m.name)
        return surface(o,tile)
    def cone(x,y,z,r,h,tile=2,top=None,n=8):
        bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if top is None else top,depth=h,location=(x,y,z));return surface(bpy.context.object,tile)
    def beam(a,b,w=.1,d=.1,tile=2):
        a,b=Vector(a),Vector(b);o=box(*((a+b)/2),w,d,(b-a).length,tile);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
    def crystal(x,y,z,s=.4):
        cone(x,y,z+s*.55,s*.36,s*1.1,3,.02,5);cone(x,y,z-.04,s*.32,s*.2,3,0,5)
    def ring(x,y,z,r=1,depth=.12,tile=2):
        for i in range(16):
            a=i*math.tau/16;b=(i+1)*math.tau/16
            beam((x+math.cos(a)*r,y,z+math.sin(a)*r),(x+math.cos(b)*r,y,z+math.sin(b)*r),depth,depth,tile)
    def finish(name):
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:p.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
        bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);parts.clear();library[name]=o;return o
    # Continuous core avoids cracks when neighboring blocks rotate; relief courses above it.
    height=3.2 if abyss else 3.4
    for course in range(4):box(0,0,(course+.5)*height/4,1.025,1.025,height/4+.004,1)
    for z in [.16,1.1,2.1,height-.1]:box(0,0,z,1.07,1.07,.16,0)
    if not abyss:
        for x in [-.34,.34]:box(x,0,height+.2,.3,1.08,.42,1)
    finish('wall')
    box(0,0,.28,1.03,1.03,.56,1);box(0,0,.58,1.12,1.12,.12,0);finish('plinth')
    box(0,0,-.055,1.015,1.015,.11,0);finish('floor_tile')
    box(0,0,0,.045,1,.009,2);finish('inlay')
    box(0,0,.65,.65,.07,1.3,3)
    for x in [-.32,.32]:box(x,-.045,.65,.035,.035,1.3,2)
    box(0,-.05,.02,.66,.035,.04,2);box(0,0,1.34,.85,.16,.09,2);finish('wall_banner')
    for x in [-3.4,-2.3,2.3,3.4]:
        box(x,0,2.6,.7,1.15,5.2,1);box(x,0,.2,.95,1.35,.4,0);box(x,0,4.6,.9,1.2,.2,0)
    box(0,.2,2.25,6.1,.7,4.5,1)
    box(0,-.2,2.0,2.7,.08,3.8,3 if abyss else 2)
    for x in [-1.42,1.42]:box(x,-.28,2.1,.22,.18,4.2,0)
    box(0,-.25,4.3,3.05,.22,.25,0);finish('gate_facade')
    box(0,0,.16,1.08,1.08,.32,0)
    box(0,0,1.95,.74,.74,3.6,1,.035)
    for z in [.55,2.8,3.7]:box(0,0,z,.96,.96,.2,0)
    for x in [-.29,.29]:box(x,-.39,1.9,.09,.09,2.3,2)
    if abyss:ring(0,0,4.15,.5,.1)
    else:cone(0,0,3.95,.62,.5,2,.25)
    finish('pillar')
    for x in [-2.95,2.95]:
        box(x,0,2.2,.7,1.05,4.4,1);box(x,0,.18,.96,1.2,.36,0);box(x,0,3.6,.9,1.15,.22,0)
    for i in range(12):
        a=i*math.pi/12;b=(i+1)*math.pi/12
        beam((math.cos(a)*2.95,0,3.8+math.sin(a)*1.6),(math.cos(b)*2.95,0,3.8+math.sin(b)*1.6),.48,.8,0)
    box(0,-.47,5.32,.44,.12,.5,2);finish('arch')
    box(0,0,.06,.75,.65,.12,0);cone(0,0,.24,.23,.28,2,.16)
    box(0,0,.62,.22,.22,.6,2)
    box(0,0,1.0,.44,.44,.14,2);box(0,0,1.25,.29,.29,.4,0)
    cone(0,0,1.49,.28,.12,2,.14);finish('lamp')
    box(0,0,1.24,.27,.27,.37,0);finish('lamp_glow')
    # Opaque mirror face, separate state overlay; no expensive real-time mirror camera.
    box(0,0,.14,.72,.55,.28,0);box(0,0,.8,.15,.18,1.2,2)
    ring(0,0,1.25,.55,.12)
    o=box(0,.015,1.25,.73,.08,.92,3,.07);finish('mirror')
    box(0,0,.15,.7,.7,.3,0);cone(0,0,.55,.2,.5,2,.16)
    ring(0,0,1.15,.4,.07);crystal(0,0,.98,.5);finish('eye')
    crystal(0,0,.98,.5);finish('eye_glow')
    box(0,0,.12,.65,.65,.24,0);cone(0,0,1.22,.045,2.15,2)
    box(.4,0,1.85,.78,.055,.78,3);beam((0,0,2.3),(.85,0,2.3),.065,.07)
    cone(0,0,2.45,.12,.23,2,0);finish('banner')
    cone(0,0,.13,.55,.26,1);cone(0,0,.29,.43,.1,2)
    for i in [-1,1]:box(i*.2,0,.37,.09,.55,.07,0)
    beam((-.28,-.25,.43),(.28,.25,.43),.09,.08,2);finish('redirector')
    box(0,0,.14,.66,.66,.28,0);box(0,0,.68,.44,.44,.8,1,.035)
    ring(0,-.27,.86,.23,.06);box(0,-.31,.85,.12,.06,.14,2);finish('seal')
    # Chunky silhouettes outside paths, instanced across room perimeter.
    for i in range(4):
        if abyss:crystal((i%2-.5)*.35,(i//2-.5)*.3,.05,.28+i*.06)
        else:box((i%2-.5)*.35,(i//2-.5)*.3,.07+i*.02,.32,.3,.16,1,.025)
    finish('rubble')
    for i in range(5):beam(((i-2)*.07,0,0),((i-2)*.10,.08*(i%2),.22+i%3*.07),.025,.04,3 if abyss else 2)
    finish('grass')
    box(0,0,.055,1.05,1.05,.11,0);finish('stair_tread')
    # Main landmarks visible above perimeter, never occupying combat center.
    for x in [-2.7,2.7]:box(x,0,2.6,.8,1,5.2,1);box(x,0,.25,1.2,1.4,.5,0)
    if abyss:
        ring(0,0,4.3,2.8,.24,0);ring(0,-.15,4.3,2.42,.1,2)
        for x in [-1.3,0,1.3]:ring(x,-.22,4.3,.5,.1);crystal(x,-.22,4,.65)
    else:
        box(0,0,5.35,6.4,1.2,.65,0);ring(0,-.2,4.1,1.8,.4,2);box(0,-.44,4.1,1.2,.25,1.4,2,.1)
        for side in [-1,1]:
            for i in range(4):ring(side*(2.0+i*.8),0,5.1+i*.25,.4,.12,2)
    finish('monument')
    box(0,0,2,2.5,2.5,4,1);cone(0,0,4.5,1.9,1.2,2,1.1)
    if abyss:ring(0,0,5.7,1.5,.25,0)
    else:
        for x in [-1,0,1]:box(x,-1.05,5.2,.45,.55,.8,1)
    finish('distant_tower')
    # Chapter enemies, each with different weapon/back silhouette, shared atlas.
    ids=['ash_wanderer','shade_hunter','facet_mage','eye_keeper','rift_weaver','crystal_guard'] if abyss else ['lost_soldier','banner_captain','seal_engine','seal_scribe','lock_arbalist','linked_guard']
    for index,name in enumerate(ids):
        for x in [-.16,.16]:box(x,0,.3,.19,.25,.6,2)
        box(0,0,.92,.52,.34,.66,1,.035);cone(0,0,1.48,.24,.36,2,.18)
        for x in [-.37,.37]:box(x,0,.95,.18,.2,.56,1)
        if name=='shade_hunter':
            for x in [-.48,.48]:beam((x,0,.65),(x,-.35,1.4),.045,.08,2)
        elif name=='facet_mage':cone(0,0,1.9,.35,.45,3,0,3);beam((.5,0,.15),(.5,0,1.8),.07,.07);crystal(.5,0,1.7,.3)
        elif name=='eye_keeper':ring(0,.2,1.85,.42,.1);crystal(0,.2,1.7,.35)
        elif name=='rift_weaver':
            for side in [-1,1]:
                for y in [-.3,0,.3]:beam((0,y,.8),(side*.8,y,.08),.08,.08)
        elif name=='crystal_guard':
            for x in [-.3,0,.3]:crystal(x,.22,1.1,.7)
        elif name=='banner_captain':beam((0,.2,.6),(0,.2,2.5),.07,.07);box(.35,.2,2.12,.7,.07,.65,3)
        elif name=='seal_engine':box(.5,0,.95,.55,.55,.65,2);cone(.5,0,1.38,.35,.2,0)
        elif name=='seal_scribe':box(.45,-.1,1.25,.5,.08,.5,0);cone(0,0,1.86,.3,.48,3,0)
        elif name=='lock_arbalist':beam((-.65,-.35,1.03),(.65,-.35,1.03),.13,.13);beam((0,-.15,1.05),(0,-.65,1.05),.1,.1)
        elif name=='linked_guard':box(-.47,-.18,.9,.52,.15,1,2,.04);box(-.47,-.28,.9,.32,.04,.66,0)
        else:beam((.45,0,.35),(.45,-.1,1.5),.065,.065)
        finish('enemy_'+name)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out/'kit.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='NONE')
    stats={name:sum(len(p.vertices)-2 for p in o.data.polygons) for name,o in library.items()}
    (ART/f'{chapter}-budget.json').write_text(json.dumps(stats,indent=2))
    # Library assembly view and individual orthographic views, all from actual export meshes.
    for i,(name,o) in enumerate(library.items()):o.location=((i%6)*7,(i//6)*8,0)
    bpy.ops.object.camera_add(location=(38,-25,35));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=49
    cam.rotation_euler=(Vector((17,16,1))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.world.color=(.4,.4,.46) if abyss else (.42,.46,.5)
    bpy.ops.object.light_add(type='AREA',location=(10,-10,25));bpy.context.object.data.energy=2400;bpy.context.object.data.size=25
    bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.4,-.4,-.3);bpy.context.object.data.energy=2
    scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/f'{chapter}.blend'))
    scene.render.filepath=str(ART/f'{chapter}-library.png');bpy.ops.render.render(write_still=True)
    for o in library.values():o.hide_render=True;o.location=(0,0,0)
    scene.render.resolution_x=512;scene.render.resolution_y=512
    for name in ['wall','pillar','arch','lamp','mirror','eye','banner','redirector','seal','monument','rubble']:
        o=library[name];o.hide_render=False
        center=Vector((0,0,float(o.dimensions.z)/2));cam.data.ortho_scale=max(o.dimensions)*1.3+.3
        for view,d in [('front',(0,-20,0)),('right',(20,0,0)),('top',(0,0,20))]:
            cam.location=center+Vector(d);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(ART/f'{chapter}-{name}-{view}.png');bpy.ops.render.render(write_still=True)
        o.hide_render=True
    print(chapter,'READY',sum(stats.values()))
