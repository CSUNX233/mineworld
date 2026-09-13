"""Starfire Wayfarer, stage A. Run in the EXISTING Blender through MCP.

Creates its own scene, never resets/deletes other scenes or saves over the current
file. Rebuild deletes only tagged production objects inside the owned scene.
Blender coordinates: Z up, -Y forward, +X anatomical LEFT. Units: metres.
"""
import bpy
import bmesh
import math
import random
import json
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix

ROOT = Path('D:/34229/mineworld')
OUT = ROOT / 'art/sunlit-actors/starfire-hero'
ASSETS = ROOT / 'public/assets/actors/starfire'
OUT.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(parents=True, exist_ok=True)
TAG = 'starfire_stage_a'
SCENE = 'Starfire_Stage_A'


def owned(data):
    data[TAG] = True
    return data


def prepare():
    scene = bpy.data.scenes.get(SCENE)
    if scene and not scene.get(TAG):
        raise RuntimeError('Scene name belongs to user work; refusing to replace it')
    if not scene:
        scene = owned(bpy.data.scenes.new(SCENE))
    bpy.context.window.scene = scene
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(scene.objects):
        if o.get(TAG):
            bpy.data.objects.remove(o, do_unlink=True)
    # Remove orphaned data from our previous build only; never global purge.
    for pool in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images,
                 bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for d in list(pool):
            if d.get(TAG) and d.users == 0:
                pool.remove(d)
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 800
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.world = owned(bpy.data.worlds.new('SF_StudioWorld'))
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs[0].default_value = (.32,.30,.27,1)
    background.inputs[1].default_value = .45
    return scene


def atlas_material():
    # 16 padded tiles, clustered pixel colour, no geometry for stitched patterns.
    colours = ['31575c','426b6b','292b43','38394f','985639','c08650',
               'e9d6ae','bdaa89','25282f','e8aa46','ffb332','fff0a0',
               '1b2c32','365e61','37384f','af7950']
    rgb = [tuple(int(h[i:i+2],16)/255 for i in (0,2,4)) for h in colours]
    pixels = [0.0] * (256*256*4)
    rng = random.Random(1839)
    cluster = {(t,x,y):rng.choice([-.09,-.035,0,0,0,.045,.09])
               for t in range(16) for y in range(32) for x in range(32)}
    for y in range(256):
        for x in range(256):
            t = (y//64)*4+x//64
            u,v = x%64,y%64
            c = rgb[t]
            delta = cluster[t,u//2,v//2]
            if t in (10,11):
                delta *= .35
            if t in (13,14):
                # Large cloth emblem and edge embroidery. Whole dedicated tiles.
                gx,gy = u//4,v//4
                emblem = ((abs(gx-8)+abs(gy-8) in (3,4)) and 5<=gx<=11 and 5<=gy<=11)
                emblem |= ((gx==8 and gy in (2,3,12,13)) or (gy==8 and gx in (2,3,12,13)))
                border = u<6 or u>57 or v<5
                if emblem or border:
                    c = rgb[6]
            i = (y*256+x)*4
            pixels[i:i+4] = [max(0,min(1,a+delta)) for a in c]+[1]
    img = owned(bpy.data.images.new('SF_Atlas_256',256,256,alpha=False))
    img.pixels.foreach_set(pixels)
    img.filepath_raw = str(ASSETS/'starfire-atlas.png')
    img.file_format = 'PNG'
    img.save()
    img.pack()
    mat = owned(bpy.data.materials.new('SF_Atlas'))
    mat.use_nodes = True
    mat.diffuse_color = (.32,.48,.45,1)
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = .88
    tex = nodes.new('ShaderNodeTexImage')
    tex.name = 'PixelAtlas'
    tex.image = img
    tex.interpolation = 'Closest'
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    return mat


class MeshBuilder:
    def __init__(self,name):
        self.name=name; self.v=[]; self.f=[]; self.w=[]; self.tiles=[]; self.uv=[]

    def vert(self,p,weight):
        self.v.append(tuple(p)); self.w.append({weight:1.0} if isinstance(weight,str) else weight.copy())
        return len(self.v)-1

    def face(self,idx,tile,uv=None):
        self.f.append(tuple(idx)); self.tiles.append(tile); self.uv.append(uv)

    def loft(self,rings,tile,weights,n=8,caps=True):
        # Horizontal elliptical rings: cx, cy, z, rx, ry.
        ids=[]
        for j,(cx,cy,z,rx,ry) in enumerate(rings):
            ids.append([self.vert((cx+rx*math.cos(2*math.pi*i/n),cy+ry*math.sin(2*math.pi*i/n),z),weights[j]) for i in range(n)])
        for j in range(len(ids)-1):
            for i in range(n):
                self.face([ids[j][i],ids[j][(i+1)%n],ids[j+1][(i+1)%n],ids[j+1][i]],tile)
        if caps:
            self.face(ids[0][::-1],tile); self.face(ids[-1],tile)

    def tube(self,points,radii,tile,weights,n=8):
        axis=(Vector(points[-1])-Vector(points[0])).normalized()
        u=axis.cross(Vector((0,1,0))).normalized()
        if u.length < .01: u=axis.cross(Vector((1,0,0))).normalized()
        v=axis.cross(u).normalized()
        ids=[]
        for j,p in enumerate(points):
            rx,ry=radii[j] if isinstance(radii[j],tuple) else (radii[j],radii[j])
            ids.append([self.vert(Vector(p)+u*(math.cos(i*2*math.pi/n)*rx)+v*(math.sin(i*2*math.pi/n)*ry),weights[j]) for i in range(n)])
        for j in range(len(ids)-1):
            for i in range(n):
                self.face([ids[j][i],ids[j][(i+1)%n],ids[j+1][(i+1)%n],ids[j+1][i]],tile)
        self.face(ids[0][::-1],tile); self.face(ids[-1],tile)

    def plate(self,points,thickness,tile,weight,full_uv=False):
        # Polygon in 3D, with a shallow back extruded in Y.
        a=[self.vert(p,weight) for p in points]
        b=[self.vert((p[0],p[1]+thickness,p[2]),weight) for p in points]
        uv=None
        if full_uv:
            xs=[p[0] for p in points]; zs=[p[2] for p in points]
            uv=[((p[0]-min(xs))/(max(xs)-min(xs)),(p[2]-min(zs))/(max(zs)-min(zs))) for p in points]
        self.face(a,tile,uv); self.face(b[::-1],tile,uv[::-1] if uv else None)
        for i in range(len(a)):
            self.face([a[i],b[i],b[(i+1)%len(a)],a[(i+1)%len(a)]],tile)

    def finish(self,scene,mat,rig=None):
        mesh=owned(bpy.data.meshes.new(self.name+'_Mesh'))
        mesh.from_pydata(self.v,[],self.f); mesh.update()
        obj=owned(bpy.data.objects.new(self.name,mesh)); scene.collection.objects.link(obj)
        mesh.materials.append(mat)
        uv=mesh.uv_layers.new(name='AtlasUV')
        for poly,tile,custom in zip(mesh.polygons,self.tiles,self.uv):
            normal=poly.normal
            drop=max(range(3),key=lambda i:abs(normal[i]))
            axes=[i for i in range(3) if i!=drop]
            center=poly.center
            for k,li in enumerate(poly.loop_indices):
                p=mesh.vertices[mesh.loops[li].vertex_index].co
                if custom:
                    u,v=custom[k]; px=4+u*56; py=4+v*56
                else:
                    # Keep each polygon continuous; modulo per vertex folds UVs.
                    px=32+(p[axes[0]]-center[axes[0]])*48
                    py=32+(p[axes[1]]-center[axes[1]])*48
                uv.data[li].uv=((tile%4*64+px)/256,(tile//4*64+py)/256)
        # Recalculate after UVs: bmesh preserves corner attributes.
        bm=bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
        if rig:
            for name in sorted({n for w in self.w for n in w}):
                obj.vertex_groups.new(name=name)
            for i,w in enumerate(self.w):
                total=sum(w.values())
                for name,value in w.items():
                    obj.vertex_groups[name].add([i],value/total,'REPLACE')
            mod=obj.modifiers.new('SF_Skin','ARMATURE'); mod.object=rig
            obj.parent=rig
        return obj


def make_rig(scene):
    arm=owned(bpy.data.armatures.new('SF_Skeleton'))
    rig=owned(bpy.data.objects.new('SF_Rig',arm)); scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,head,tail,parent=None,deform=True):
        b=arm.edit_bones.new(name); b.head=head; b.tail=tail
        if parent: b.parent=arm.edit_bones[parent]
        b.use_deform=deform
        # Stable local X for sagittal flexion on torso and legs.
        b.align_roll(Vector((0,-1,0)))
    bone('root',(0,0,0),(0,0,.18),deform=False)
    bone('pelvis',(0,0,.91),(0,0,1.04),'root')
    bone('spine',(0,0,1.04),(0,0,1.24),'pelvis')
    bone('chest',(0,0,1.24),(0,0,1.42),'spine')
    bone('neck',(0,0,1.42),(0,0,1.53),'chest')
    bone('head',(0,0,1.53),(0,0,1.86),'neck')
    for suffix,s in [('L',1),('R',-1)]:
        bone('clavicle.'+suffix,(s*.055,0,1.39),(s*.29,0,1.38),'chest')
        bone('upper_arm.'+suffix,(s*.29,0,1.38),(s*.445,-.008,1.16),'clavicle.'+suffix)
        bone('forearm.'+suffix,(s*.445,-.008,1.16),(s*.535,-.012,.96),'upper_arm.'+suffix)
        bone('hand.'+suffix,(s*.535,-.012,.96),(s*.565,-.025,.85),'forearm.'+suffix)
        bone('fingers.'+suffix,(s*.57,-.022,.89),(s*.58,-.06,.81),'hand.'+suffix)
        bone('thumb.'+suffix,(s*.522,-.027,.925),(s*.51,-.085,.865),'hand.'+suffix)
        bone('thigh.'+suffix,(s*.135,0,.93),(s*.18,-.025,.51),'pelvis')
        bone('shin.'+suffix,(s*.18,-.025,.51),(s*.185,0,.14),'thigh.'+suffix)
        bone('foot.'+suffix,(s*.185,0,.14),(s*.185,-.17,.055),'shin.'+suffix)
        bone('toe.'+suffix,(s*.185,-.17,.055),(s*.185,-.245,.045),'foot.'+suffix)
    bone('cape.upper',(0,.14,1.39),(.07,.22,1.16),'chest')
    bone('cape.lower',(.07,.22,1.16),(.14,.25,.91),'cape.upper')
    bone('tabard',(0,-.145,.95),(0,-.18,.60),'pelvis')
    bone('vessel.L',(.28,0,.99),(.30,0,.84),'pelvis')
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front=True
    arm.display_type='OCTAHEDRAL'
    for p in rig.pose.bones: p.rotation_mode='XYZ'
    rig['forward']='-Y; glTF +Z'
    rig['anatomical_left']='+X'
    rig['stage']='A: rest rig and inspection poses only, no gameplay clips'
    return rig


def make_body():
    b=MeshBuilder('SF_Body')
    b.loft([(0,0,.90,.21,.13),(0,0,1.02,.20,.14),(0,0,1.18,.235,.155),(0,0,1.35,.28,.15),(0,0,1.42,.20,.12)],2,
           ['pelvis',{'pelvis':.65,'spine':.35},'spine',{'spine':.15,'chest':.85},'chest'])
    # Split short tunic hem, leaving the knee line and hips readable.
    for s,side in [(1,'L'),(-1,'R')]:
        b.loft([(s*.135,0,.92,.135,.135),(s*.158,0,.79,.145,.13),(s*.177,-.017,.62,.119,.11),(s*.18,-.025,.53,.09,.085),
                (s*.18,-.02,.48,.087,.08),(s*.183,-.003,.35,.079,.076),(s*.185,0,.16,.055,.063)],2,
               [{'pelvis':.35,'thigh.'+side:.65},'thigh.'+side,'thigh.'+side,{'thigh.'+side:.65,'shin.'+side:.35},
                {'thigh.'+side:.20,'shin.'+side:.80},'shin.'+side,'shin.'+side])
        b.loft([(s*.185,-.075,.018,.093,.17),(s*.185,-.085,.066,.10,.178),(s*.185,-.055,.115,.087,.135),(s*.185,0,.18,.061,.065)],8,
               ['foot.'+side,'foot.'+side,'foot.'+side,{'shin.'+side:.45,'foot.'+side:.55}])
        # Heel/cuff leather; cream toe cap is a single faceted shell.
        b.loft([(s*.185,0,.145,.07,.076),(s*.185,0,.198,.07,.077)],4,['foot.'+side]*2)
        b.plate([(s*.185-.060,-.256,.085),(s*.185+.060,-.256,.085),(s*.185+.074,-.15,.149),(s*.185,-.102,.158),(s*.185-.074,-.15,.149)],.010,6,'foot.'+side)
        b.loft([(s*.18,-.015,.46,.091,.086),(s*.18,-.02,.51,.108,.097),(s*.18,-.018,.58,.112,.096)],4,
               ['shin.'+side,{'thigh.'+side:.4,'shin.'+side:.6},'thigh.'+side])
        b.plate([(s*.18-.095,-.100,.575),(s*.18+.095,-.100,.575),(s*.18+.10,-.137,.52),(s*.18,-.15,.465),(s*.18-.10,-.137,.52)],.025,6,'shin.'+side)
    # Belt, buckle, diagonal leather baldric.
    b.loft([(0,0,.96,.215,.15),(0,0,1.035,.218,.155)],4,['pelvis']*2)
    b.plate([(-.057,-.173,.963),(.057,-.173,.963),(.057,-.173,1.04),(-.057,-.173,1.04)],.025,7,'pelvis')
    b.plate([(-.030,-.184,.98),(.027,-.184,.98),(.027,-.184,1.023),(-.030,-.184,1.023)],.008,4,'pelvis')
    b.plate([(-.247,-.17,1.397),(-.195,-.19,1.433),(.17,-.185,1.07),(.11,-.195,1.048)],.014,4,'chest')
    b.plate([(-.201,-.207,1.346),(-.16,-.211,1.381),(-.091,-.211,1.32),(-.134,-.207,1.28)],.012,6,'chest')
    # Front apron/cloth tabard: single pentagon, embroidery in atlas.
    b.plate([(-.105,-.166,.974),(.105,-.166,.974),(.092,-.19,.604),(0,-.196,.56),(-.092,-.19,.604)],.008,14,'tabard',True)
    # One practical side pouch on anatomical right.
    b.loft([(-.26,.017,.80,.075,.049),(-.27,.012,.90,.08,.056),(-.24,.01,.96,.068,.047)],4,['pelvis']*3)
    # Left vessel, six-sided silhouette in the frontal XZ plane.
    center=Vector((.302,-.015,.87))
    for rad,y,depth,tile in [(.106,-.065,.10,4),(.083,-.080,.018,9),(.062,-.094,.008,12)]:
        p=[(center.x+math.cos(math.pi/6+i*math.pi/3)*rad,y,center.z+math.sin(math.pi/6+i*math.pi/3)*rad) for i in range(6)]
        b.plate(p,depth,tile,'vessel.L')
    b.plate([(.278,-.103,.842),(.326,-.103,.842),(.326,-.103,.89),(.278,-.103,.89)],.004,10,'vessel.L')
    b.plate([(.293,-.108,.827),(.311,-.108,.827),(.311,-.108,.908),(.293,-.108,.908)],.003,11,'vessel.L')
    b.plate([(.265,-.055,.96),(.336,-.055,.96),(.328,-.055,.994),(.272,-.055,.994)],.06,9,'vessel.L')
    # Short asymmetric shoulder cape, left shoulder broad, right shoulder exposed.
    b.plate([(-.13,-.181,1.424),(.17,-.178,1.467),(.35,-.153,1.468),(.477,-.151,1.275),(.245,-.192,1.29),(.035,-.204,1.34)],.012,13,{'chest':.55,'upper_arm.L':.45},True)
    # Connect shoulder cover to the back cape across the upper shoulder.
    b.plate([(.14,-.178,1.457),(.35,-.153,1.468),(.445,.118,1.405),(.14,.16,1.419)],.012,0,{'chest':.55,'upper_arm.L':.45})
    # Back cape as a deformable 4x4 panel with small thickness, not cloth sim.
    xs=[-.245,-.055,.155,.36]
    rows=[(1.39,.14),(1.26,.22),(1.09,.247),(.88,.27)]
    grids=[]
    for j,(z,y) in enumerate(rows):
        row=[]
        for i,x in enumerate(xs):
            zz=z+(0 if j<2 else (.13*(1-i/3)))
            weight=({'chest':.55,'cape.upper':.45} if j==0 else 'cape.upper' if j==1 else {'cape.upper':.4,'cape.lower':.6} if j==2 else 'cape.lower')
            row.append(b.vert((x*(1-.12*j),y,zz),weight))
        grids.append(row)
    for j in range(3):
        for i in range(3):
            ids=[grids[j][i],grids[j+1][i],grids[j+1][i+1],grids[j][i+1]]
            uv=[(i/3,1-j/3),(i/3,1-(j+1)/3),((i+1)/3,1-(j+1)/3),((i+1)/3,1-j/3)]
            b.face(ids,13,uv)
            # Back face shares vertices; give thickness later through a separate panel shell.
            back=[b.vert(Vector(b.v[k])+Vector((0,.012,0)),b.w[k]) for k in ids]
            b.face(back[::-1],13,uv[::-1])
    return b


def make_head():
    b=MeshBuilder('SF_Head')
    # Hood rings run from facial opening to the rounded back. Seven perimeter vertices.
    front=[(0,-.208,1.925),(.155,-.218,1.866),(.239,-.223,1.63),(.153,-.221,1.49),(-.153,-.221,1.49),(-.239,-.223,1.63),(-.155,-.218,1.866)]
    mid=[(0,.045,1.94),(.183,.055,1.872),(.246,.065,1.63),(.161,.066,1.50),(-.161,.066,1.50),(-.246,.065,1.63),(-.183,.055,1.872)]
    back=[(0,.198,1.88),(.129,.209,1.824),(.177,.215,1.655),(.125,.183,1.54),(-.125,.183,1.54),(-.177,.215,1.655),(-.129,.209,1.824)]
    ids=[[b.vert(p,'head') for p in ring] for ring in (front,mid,back)]
    for j in range(2):
        for i in range(7): b.face([ids[j][i],ids[j][(i+1)%7],ids[j+1][(i+1)%7],ids[j+1][i]],0)
    b.face(ids[2][::-1],0)
    inner=[(x*.84,y+.022,1.705+(z-1.705)*.84) for x,y,z in front]
    innerids=[b.vert(p,'head') for p in inner]
    for i in range(7): b.face([ids[0][i],innerids[i],innerids[(i+1)%7],ids[0][(i+1)%7]],12)
    b.plate([(x,y+.044,z) for x,y,z in inner],.045,8,'head')
    # Three distinct ceramic plates. Center ridge projects; amber slits remain visible.
    b.plate([(-.064,-.245,1.84),(0,-.286,1.872),(.064,-.245,1.84),(.044,-.252,1.663),(0,-.276,1.55),(-.044,-.252,1.663)],.022,6,'head')
    for s in [-1,1]:
        b.plate([(s*.087,-.248,1.833),(s*.146,-.223,1.808),(s*.157,-.227,1.67),(s*.067,-.251,1.579),(s*.060,-.25,1.66),(s*.091,-.25,1.732)],.02,6,'head')
        b.plate([(s*.072,-.251,1.805),(s*.087,-.251,1.757),(s*.064,-.256,1.683),(s*.054,-.256,1.72)],.005,10,'head')
    # Cowl neck ring is a compact chamfered scarf, head turn remains clear.
    b.loft([(0,0,1.397,.18,.143),(0,-.022,1.448,.25,.184),(0,0,1.488,.21,.164)],0,['neck']*3)
    return b


def make_arm(side,s):
    b=MeshBuilder('SF_Arm_'+side)
    upper='upper_arm.'+side; fore='forearm.'+side; hand='hand.'+side
    points=[(s*.279,0,1.38),(s*.337,0,1.317),(s*.405,-.006,1.22),(s*.444,-.008,1.164),(s*.456,-.01,1.131),(s*.495,-.013,1.055),(s*.535,-.012,.96)]
    b.tube(points,[(.106,.108),(.114,.10),(.083,.082),(.075,.072),(.076,.068),(.072,.062),(.052,.049)],2,
           [upper,upper,upper,{upper:.6,fore:.4},{upper:.15,fore:.85},fore,fore])
    # Right shoulder ceramic plate; left has the teal cape.
    if side=='R':
        b.plate([(s*.24,-.136,1.427),(s*.35,-.136,1.402),(s*.414,-.122,1.305),(s*.30,-.148,1.331)],.045,6,upper)
    b.tube([(s*.482,-.012,1.095),(s*.511,-.012,1.025)],[(.079,.071),(.072,.066)],4,[fore]*2)
    b.plate([(s*.459,-.073,1.12),(s*.497,-.087,1.139),(s*.541,-.071,1.029),(s*.509,-.081,1.001)],.025,6,fore)
    b.tube([(s*.526,-.012,.986),(s*.544,-.012,.945)],[(.067,.058),(.065,.056)],4,[fore,hand])
    # Chamfered palm.
    b.loft([(s*.568,-.008,.857,.043,.035),(s*.56,-.008,.91,.052,.041),(s*.54,-.008,.953,.041,.037)],8,[hand]*3)
    if side=='R':
        # Three grouped glove fingers curve around a vertical grip. Clear thumb opposition.
        for j in range(3):
            z=.91-j*.027
            b.tube([(s*.600,-.02,z),(s*.597,-.067,z-.004),(s*.567,-.085,z-.005),(s*.541,-.066,z-.004)],
                   [.015,.016,.015,.012],8,[hand,'fingers.R','fingers.R','fingers.R'],n=6)
        b.tube([(s*.521,-.016,.927),(s*.514,-.054,.905),(s*.547,-.08,.895)],[.019,.019,.014],8,[hand,'thumb.R','thumb.R'],n=6)
    else:
        for j in range(4):
            x=s*(.526+j*.022)
            z=.833 if j in (0,3) else .818
            b.tube([(x,-.009,.88),(x+s*.015,-.021,z),(x+s*.017,-.031,z-.027)],[.012,.011,.009],8,[hand,'fingers.L','fingers.L'],n=6)
        b.tube([(s*.519,-.003,.925),(s*.49,-.022,.883),(s*.484,-.04,.865)],[.018,.016,.011],8,[hand,'thumb.L','thumb.L'],n=6)
    return b


def socket(scene,rig,name,bone,position,direction=(0,0,1)):
    o=owned(bpy.data.objects.new(name,None)); scene.collection.objects.link(o)
    o.empty_display_type='ARROWS'; o.empty_display_size=.10
    o.parent=rig; o.parent_type='BONE'; o.parent_bone=bone
    bpy.context.view_layer.update()
    # Bone parenting includes the bone-tail offset; setting matrix_world derives it.
    o.matrix_world=Matrix.Translation(Vector(position)) @ Vector(direction).to_track_quat('Z','Y').to_matrix().to_4x4()
    o['socket_role']=name; o['visual_only']=True
    return o


def make_weapon(scene,mat,grip,kind):
    b=MeshBuilder('SF_Proxy_'+kind)
    if kind=='Sword':
        b.loft([(0,0,-.105,.025,.025),(0,0,.105,.025,.025)],4,['unused']*2)
        b.loft([(0,0,-.126,.036,.031),(0,0,-.104,.031,.03)],9,['unused']*2)
        b.plate([(-.10,-.027,.10),(.10,-.027,.10),(.085,-.027,.143),(-.085,-.027,.143)],.054,9,'unused')
        # Diamond section, real blade thickness and point.
        b.loft([(0,0,.145,.059,.021),(0,0,.49,.045,.018),(0,0,.61,.001,.001)],6,['unused']*3,n=4)
    else:
        b.loft([(0,0,-.55,.023,.023),(0,0,.53,.027,.027)],4,['unused']*2)
        for z in [-.5,-.05,.045,.45]: b.loft([(0,0,z,.032,.032),(0,0,z+.03,.032,.032)],9,['unused']*2)
        for rad,y,depth,tile in [(.113,-.026,.052,9),(.08,-.032,.008,12),(.047,-.038,.006,10),(.08,.028,.008,12),(.047,.037,.006,10)]:
            b.plate([(math.cos(math.pi/6+i*math.pi/3)*rad,y,.58+math.sin(math.pi/6+i*math.pi/3)*rad) for i in range(6)],depth,tile,'unused')
    obj=b.finish(scene,mat)
    obj.parent=grip; obj.matrix_parent_inverse=Matrix.Identity(4); obj.location=(0,0,0); obj.rotation_euler=(0,0,0)
    obj['proxy_only']=True
    obj['grip_origin']='local origin; long axis +Z; blade plane XZ'
    tip=owned(bpy.data.objects.new('SF_'+('StaffMuzzle' if kind=='Staff' else 'BladeTip'),None))
    scene.collection.objects.link(tip); tip.parent=obj; tip.location=(0,0,.70 if kind=='Staff' else .61)
    tip.empty_display_type='ARROWS'; tip.empty_display_size=.08
    obj.hide_render=kind=='Staff'; obj.hide_set(kind=='Staff')
    return obj


def studio(scene):
    for name,pos,power,size in [('Key',(-3,-4,6),420,4),('Fill',(3,-1,4),230,3),('Rim',(1,3,5),370,3)]:
        data=owned(bpy.data.lights.new('SF_'+name,'AREA')); data.energy=power; data.shape='DISK'; data.size=size
        o=owned(bpy.data.objects.new('SF_'+name,data)); scene.collection.objects.link(o); o.location=pos
        o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
    data=owned(bpy.data.cameras.new('SF_ReviewCamera')); cam=owned(bpy.data.objects.new('SF_ReviewCamera',data)); scene.collection.objects.link(cam)
    data.type='ORTHO'; data.ortho_scale=2.36; data.lens=55; scene.camera=cam
    return cam


def view(name='three_quarter'):
    scene=bpy.data.scenes[SCENE]; cam=scene.camera
    target=Vector((0,0,.99))
    positions={'front':(0,-6,1.0),'side':(6,0,1.0),'back':(0,6,1.0),'three_quarter':(3,-5,3.05),'rear_quarter':(-3,5,2.7)}
    cam.location=positions[name]; cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            space.region_3d.view_distance=3.45
            space.region_3d.view_location=target
            space.region_3d.view_perspective='ORTHO'
            space.region_3d.update()
            space.overlay.show_overlays=False
            space.shading.type='MATERIAL'
            space.shading.use_scene_world=False
            space.shading.use_scene_lights=False
    bpy.context.view_layer.update()


def build():
    scene=prepare(); mat=atlas_material(); rig=make_rig(scene)
    objects=[make_body().finish(scene,mat,rig),make_head().finish(scene,mat,rig),
             make_arm('L',1).finish(scene,mat,rig),make_arm('R',-1).finish(scene,mat,rig)]
    for o in objects: o['first_person_visible']=o.name.startswith('SF_Arm')
    grip=socket(scene,rig,'SF_Grip_R','hand.R',(-.566,-.053,.876),(0,0,-1))
    grip['axis_protocol']='local +Z weapon length; local XZ blade plane; +Y normal'
    socket(scene,rig,'SF_Skill_L','hand.L',(.555,-.061,.90),(0,-1,0))
    socket(scene,rig,'SF_AttackAxis_R','hand.R',(-.566,-.053,.876),(0,0,-1))
    make_weapon(scene,mat,grip,'Sword'); make_weapon(scene,mat,grip,'Staff')
    studio(scene); view()
    for o in scene.objects: o.select_set(False)
    bpy.context.view_layer.objects.active=rig
    scene['reference']='01-hero-starfire.png; user handedness overrides all boards'
    scene['revision']='A03 shoulder cape clearance, skin flex and double-sided staff focus'
    scene.frame_start=1; scene.frame_end=48
    print(json.dumps({'scene':scene.name,'bones':len(rig.data.bones),'meshes':[(o.name,len(o.data.vertices),len(o.data.polygons)) for o in objects]},indent=2))


if __name__=='__main__':
    build()
