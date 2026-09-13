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
ARM_REST_INSET_DEGREES = 22
WRIST_REST_COUNTER_DEGREES = 10


def arm_rest(point):
    """Bring the upper arm closer to the torso; mesh, rig and sockets agree."""
    x,y,z=point
    sign=1 if x>=0 else -1
    pivot=Vector((sign*.29,0,1.38))
    adjusted=Vector(point)
    wrist=Vector((sign*.535,-.012,.96))
    wrist_blend=max(0,min(1,(.99-z)/.03))
    adjusted=wrist+Quaternion(Vector((0,1,0)),-sign*math.radians(WRIST_REST_COUNTER_DEGREES*wrist_blend))@(adjusted-wrist)
    return pivot+Quaternion(Vector((0,1,0)),sign*math.radians(ARM_REST_INSET_DEGREES))@(adjusted-pivot)


def anatomy(point,arm=False,relax=True):
    """Art-directed proportion correction, shared by mesh, joints and sockets.

    Keep the boots/head dimensions; lengthen thighs/shins, raise the belt and
    narrow pelvis/legs. Arms retain their lateral reach and follow the new height.
    """
    x,y,z=arm_rest(point) if arm and relax else point
    keys=[(0,.0,.92),(.20,.20,.92),(.60,.68,.84),(1.04,1.208,.82),
          (1.42,1.525,1.0),(2.1,2.205,1.0)]
    for (za,ta,sa),(zb,tb,sb) in zip(keys,keys[1:]):
        if z<=zb:
            t=max(0,(z-za)/(zb-za)); newz=ta+(tb-ta)*t; sx=sa+(sb-sa)*t
            return (x if arm else x*sx,y,newz)
    return (x,y,z+.105)


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
    colours = ['31575c','31575c','292b43','38394f','985639','c08650',
               'e9d6ae','bdaa89','25282f','e8aa46','ffb332','fff0a0',
               '1b2c32','365e61','37384f','31575c']
    rgb = [tuple(int(h[i:i+2],16)/255 for i in (0,2,4)) for h in colours]
    pixels = [0.0] * (256*256*4)
    rng = random.Random(1839)
    cluster = {(t,x,y):rng.choice([-.055,-.025,0,0,0,.025,.055])
               for t in range(16) for y in range(32) for x in range(32)}
    for y in range(256):
        for x in range(256):
            t = (y//64)*4+x//64
            u,v = x%64,y%64
            c = rgb[t]
            delta = cluster[t,u//2,v//2]
            if t==0:
                # Large sewn cloth blocks, shared by hood and folded collar.
                delta=cluster[t,u//3,v//3]*.65
            if t==1: delta=cluster[t,u//6,v//6]
            if t==3:
                delta=cluster[t,u//6,v//3]*.8
                if u in (5,6,57,58): delta+=.025
            if t==13:
                # Broader cloth blocks read from the normal third-person distance.
                delta=cluster[t,u//4,v//3]*.8
                if u in (18,19,39): delta-=.025
            if t in (6,7):
                delta *= .4
                # Ceramic panel joints are pixels in the shared atlas.
                if u%12==0 or v%12==0: delta-=.055
            if t in (10,11):
                delta *= .35
            if t==1:
                # Hood side emblem; not repeated across every hood polygon.
                dx,dy=u//3-10,v//3-10
                if abs(dx)+abs(dy)==3 or (dx==0 and abs(dy) in (4,5)) or (dy==0 and abs(dx) in (4,5)):
                    c=rgb[6]
            if t in (13,14,15):
                # Separate placement/density for back cape, tabard and shoulder.
                gx,gy = u//3,v//3
                cx,cy = (13,14) if t==13 else (10,7) if t==14 else (15,10)
                # Shoulder UV spans a wide trapezoid: compensate its aspect ratio.
                dx,dy = (gx-cx)*2 if t==15 else gx-cx,gy-cy
                emblem = (abs(dx)+abs(dy)==3)
                emblem |= ((dx==0 and abs(dy) in (4,5)) or (dy==0 and abs(dx) in (4,5)))
                emblem |= (dx==dy and abs(dx)==3) or (dx==-dy and abs(dx)==3)
                if t==14: emblem |= (dx==0 and dy in (7,8)) or (dx==2 and dy==9)
                border = (u<11 or u>52 or v<10) if t==14 else (v<10 or (t==13 and u>56))
                if emblem or border:
                    c = rgb[6]
            if t==13:
                # Woven pixel cloth: quiet broad dye blocks, stepped fold shadows,
                # occasional one-pixel yarn highlights. All in the shared atlas.
                c=rgb[13]
                delta=cluster[t,u//3,v//3]*.65+cluster[t,u//9,v//8]*.40
                delta+=(-.035 if 16<=u<20 else .022 if 20<=u<24 else -.018 if 42<=u<45 else 0)
                delta+=.009 if (u+v//3)%7==0 and v%3==0 else 0
                delta-=.012 if u%9==0 and v%8 not in (0,1) else 0
                gx,gy=u//3,v//3
                star=["000100000", "100110001", "010010010", "001111100",
                      "110101011", "001111100", "010010010", "100110000", "000100000"]
                sx,sy=gx-8,18-gy
                emblem=0<=sx<9 and 0<=sy<9 and star[sy][sx]=='1'
                hem=(gy==2 and gx%4 in (0,1)) or (gy==3 and gx%4 in (2,3)) or (gy==4 and gx in (5,14,18))
                if emblem or hem:
                    c=rgb[6];delta=cluster[t,u//3,v//3]*.22
                    # Sun-faded embroidery, with shaded lower edges instead of flat white.
                    delta-=.025 if v%3==0 else 0
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

    def bevel_plate(self,points,weight,tile=6,depth=.035):
        """One thick chamfered ceramic plate; detail remains in the atlas."""
        center=sum((Vector(p) for p in points),Vector())/len(points)
        outer=[self.vert(p,weight) for p in points]
        inner=[self.vert(center+(Vector(p)-center)*.79+Vector((0,-.021,0)),weight) for p in points]
        back=[self.vert(Vector(p)+Vector((0,depth,0)),weight) for p in points]
        self.face(inner,tile); self.face(back[::-1],7)
        for i in range(len(points)):
            j=(i+1)%len(points)
            self.face([outer[i],outer[j],inner[j],inner[i]],tile)
            self.face([outer[i],back[i],back[j],outer[j]],7)

    def cloth(self,rows,weights,tile,thickness=.012):
        """Continuous folded cloth shell with shared vertices and per-vertex weights."""
        height=len(rows); width=len(rows[0])
        front=[[self.vert(p,weights[j][i]) for i,p in enumerate(row)] for j,row in enumerate(rows)]
        back=[[self.vert(Vector(p)+Vector((0,thickness,0)),weights[j][i]) for i,p in enumerate(row)] for j,row in enumerate(rows)]
        for j in range(height-1):
            for i in range(width-1):
                uv=[(i/(width-1),1-j/(height-1)),(i/(width-1),1-(j+1)/(height-1)),
                    ((i+1)/(width-1),1-(j+1)/(height-1)),((i+1)/(width-1),1-j/(height-1))]
                if tile==0: uv=None  # Plain collar uses world-scale cloth blocks, not a squeezed full tile.
                self.face([front[j][i],front[j+1][i],front[j+1][i+1],front[j][i+1]],tile,uv)
                self.face([back[j][i+1],back[j+1][i+1],back[j+1][i],back[j][i]],tile,uv[::-1] if uv else None)
        edge=[(0,i) for i in range(width)]+[(j,width-1) for j in range(1,height)]
        edge += [(height-1,i) for i in range(width-2,-1,-1)]+[(j,0) for j in range(height-2,0,-1)]
        for k,(j,i) in enumerate(edge):
            nj,ni=edge[(k+1)%len(edge)]
            self.face([front[j][i],back[j][i],back[nj][ni],front[nj][ni]],0 if tile==13 else tile)

    def finish(self,scene,mat,rig=None):
        mesh=owned(bpy.data.meshes.new(self.name+'_Mesh'))
        vertices=[]
        for p,w in zip(self.v,self.w):
            if not rig: vertices.append(p); continue
            if self.name.startswith('SF_Arm'): vertices.append(anatomy(p,arm=True)); continue
            # Cloth sewn to an arm must share its adjusted rest position.
            amount=sum(value for bone,value in w.items() if bone.startswith('upper_arm.'))
            corrected=Vector(p).lerp(arm_rest(p),amount) if amount else p
            vertices.append(anatomy(corrected))
        mesh.from_pydata(vertices,[],self.f); mesh.update()
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
                    px=32+(p[axes[0]]-center[axes[0]])*58
                    py=32+(p[axes[1]]-center[axes[1]])*58
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
        is_arm=name.startswith(('clavicle.','upper_arm.','forearm.','hand.','fingers.','thumb.'))
        b=arm.edit_bones.new(name)
        b.head=anatomy(head,is_arm,relax=not name.startswith('clavicle.'))
        b.tail=anatomy(tail,is_arm,relax=not name.startswith('clavicle.'))
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
    bone('cape.upper',(0,.14,1.39),(-.07,.22,1.16),'chest')
    bone('cape.lower',(-.07,.22,1.16),(-.14,.25,.91),'cape.upper')
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
        b.bevel_plate([(s*.18-.09,-.100,.592),(s*.18+.09,-.100,.592),(s*.18+.107,-.126,.523),(s*.18,-.153,.455),(s*.18-.107,-.126,.523)],'shin.'+side,depth=.026)
        # Faceted lateral wings give the knee plate a wrap, with a clear hinge gap.
        for wing in [-1,1]:
            x=s*.18
            b.bevel_plate([(x+wing*.073,-.10,.587),(x+wing*.108,-.047,.584),
                           (x+wing*.112,.028,.526),(x+wing*.101,-.038,.479),
                           (x+wing*.091,-.117,.506)],'shin.'+side,depth=.015)
    # Belt, buckle, diagonal leather baldric.
    b.loft([(0,0,.96,.215,.15),(0,0,1.035,.218,.155)],4,['pelvis']*2)
    b.plate([(-.057,-.173,.963),(.057,-.173,.963),(.057,-.173,1.04),(-.057,-.173,1.04)],.025,7,'pelvis')
    b.plate([(-.030,-.184,.98),(.027,-.184,.98),(.027,-.184,1.023),(-.030,-.184,1.023)],.008,4,'pelvis')
    # Raised buckle frame and two broad belt keepers, no tiny dangling accessories.
    b.bevel_plate([(-.062,-.182,1.041),(.059,-.182,1.041),(.059,-.182,.961),(-.062,-.182,.961)],'pelvis',tile=7,depth=.018)
    b.plate([(-.03,-.212,.98),(.027,-.212,.98),(.027,-.212,1.023),(-.03,-.212,1.023)],.008,4,'pelvis')
    b.plate([(-.055,-.22,1.004),(.003,-.22,1.004),(.003,-.22,1.013),(-.055,-.22,1.013)],.009,7,'pelvis')
    for x in [-.139,.137]:
        b.plate([(x-.019,-.156,.953),(x+.019,-.156,.953),(x+.025,-.16,1.048),(x-.012,-.16,1.059)],.02,5,'pelvis')
    b.plate([(-.247,-.17,1.397),(-.195,-.19,1.433),(.17,-.185,1.07),(.11,-.195,1.048)],.014,4,'chest')
    b.plate([(-.201,-.207,1.346),(-.16,-.211,1.381),(-.091,-.211,1.32),(-.134,-.207,1.28)],.012,6,'chest')
    b.plate([(-.169,-.225,1.34),(-.149,-.225,1.357),(-.118,-.225,1.328),(-.137,-.225,1.31)],.008,4,'chest')
    # Small ceramic chest inset visible below the opposite shoulder cape.
    b.bevel_plate([(.11,-.16,1.292),(.20,-.144,1.268),(.19,-.161,1.197),(.108,-.171,1.224)],'chest',depth=.015)
    # Front apron/cloth tabard: single pentagon, embroidery in atlas.
    b.plate([(-.105,-.166,.974),(.105,-.166,.974),(.092,-.19,.604),(0,-.196,.56),(-.092,-.19,.604)],.008,14,'tabard',True)
    # Short split coat tails, anchored to the corresponding upper leg to clear flexion.
    for side,s in [('L',1),('R',-1)]:
        b.plate([(s*.12,-.13,.966),(s*.20,-.10,.942),(s*.254,-.097,.697),(s*.177,-.152,.65)],.01,3,{'pelvis':.3,'thigh.'+side:.7})
    # Left vessel, six-sided silhouette in the frontal XZ plane.
    center=Vector((.302,-.015,.87))
    for rad,y,depth,tile in [(.106,-.065,.10,4),(.083,-.080,.018,9),(.062,-.094,.008,12)]:
        p=[(center.x+math.cos(math.pi/6+i*math.pi/3)*rad,y,center.z+math.sin(math.pi/6+i*math.pi/3)*rad) for i in range(6)]
        b.plate(p,depth,tile,'vessel.L')
    b.plate([(.278,-.103,.842),(.326,-.103,.842),(.326,-.103,.89),(.278,-.103,.89)],.004,10,'vessel.L')
    b.plate([(.293,-.108,.827),(.311,-.108,.827),(.311,-.108,.908),(.293,-.108,.908)],.003,11,'vessel.L')
    b.plate([(.266,-.107,.857),(.339,-.107,.857),(.339,-.107,.879),(.266,-.107,.879)],.003,10,'vessel.L')
    b.plate([(.265,-.055,.96),(.336,-.055,.96),(.328,-.055,.994),(.272,-.055,.994)],.06,9,'vessel.L')
    cape_start=len(b.v)
    # Shoulder mantle is sewn to the chest; only its outside edge follows the arm.
    mantle_rows=[
        [(-.12,-.175,1.435),(.09,-.192,1.46),(.27,-.16,1.45),(.365,-.075,1.452)],
        [(-.075,-.183,1.4),(.105,-.205,1.389),(.292,-.189,1.365),(.465,-.123,1.37)],
        [(-.027,-.184,1.365),(.12,-.195,1.321),(.312,-.175,1.282),(.488,-.129,1.272)]]
    mantle_weights=[['chest','chest',{'chest':.20,'upper_arm.L':.80},'upper_arm.L'],
                    ['chest','chest',{'chest':.20,'upper_arm.L':.80},'upper_arm.L'],
                    ['chest','chest',{'chest':.20,'upper_arm.L':.80},'upper_arm.L']]
    b.cloth(mantle_rows,mantle_weights,15)
    # Outer shoulder fall wraps over the sleeve, leaving the elbow free.
    shoulder_side=[[(.365,-.075,1.452),(.413,.005,1.481),(.395,.11,1.449)],
                   [(.465,-.123,1.37),(.518,.0,1.382),(.476,.115,1.359)],
                   [(.488,-.129,1.272),(.526,.005,1.267),(.491,.114,1.284)]]
    side_weights=[['upper_arm.L']*3]*3
    b.cloth(shoulder_side,side_weights,0)
    b.cloth([[(x+.001,y-.002,z+.019) for x,y,z in shoulder_side[-1]],
             [(x+.002,y-.003,z) for x,y,z in shoulder_side[-1]]],[side_weights[-1]]*2,6)
    # Continuous shoulder fold joins front mantle to the back attachment.
    b.cloth([mantle_rows[0][1:],[(.09,.065,1.455),(.27,.067,1.438),(.395,.078,1.449)],
             [(.09,.15,1.412),(.27,.16,1.405),(.371,.15,1.416)]],
            [mantle_weights[0][1:],[ 'chest',{'chest':.20,'upper_arm.L':.80},'upper_arm.L'],
             ['chest','chest',{'chest':.7,'upper_arm.L':.3}]],0)
    # Narrow right-back fall after mirroring: inner edge vertical, outer tip lowest.
    cape_rows=[
        [(-.13,.141,1.412),(.035,.164,1.433),(.20,.177,1.42),(.371,.15,1.416)],
        [(.035,.184,1.282),(.125,.205,1.29),(.245,.225,1.278),(.341,.184,1.255)],
        [(.055,.193,1.085),(.15,.223,1.075),(.275,.239,1.055),(.377,.212,1.069)],
        [(.08,.184,.98),(.18,.208,.90),(.30,.235,.815),(.424,.211,.733)]]
    cape_weights=[['chest','chest',{'chest':.65,'upper_arm.L':.35},'upper_arm.L'],[{'chest':.25,'cape.upper':.75}]*4,
                  [{'cape.upper':.45,'cape.lower':.55}]*4,['cape.lower']*4]
    b.cloth(cape_rows,cape_weights,13)
    # Short folded back collar bridges the neck and cape attachment.
    b.cloth([[(-.225,.141,1.411),(-.105,.195,1.423),(0,.207,1.407),(.13,.194,1.423),(.27,.15,1.421)],
             [(-.205,.183,1.364),(-.10,.245,1.347),(0,.267,1.285),(.13,.242,1.347),(.25,.193,1.374)]],
            [['chest']*5]*2,0)
    # Rear-view board takes precedence for cape placement: anatomical RIGHT.
    for index in range(cape_start,len(b.v)):
        x,y,z=b.v[index];b.v[index]=(-x,y,z)
        b.w[index]={name.replace('upper_arm.L','upper_arm.R'):value for name,value in b.w[index].items()}
    # Narrow rear harness, visible only along the uncovered side, with two square fittings.
    b.plate([(.185,.135,1.336),(.232,.12,1.324),(.23,.145,1.04),(.176,.156,1.044)],-.012,4,'chest')
    for z in [1.19,1.075]:
        b.plate([(.172,.164,z),(.231,.16,z),(.231,.16,z+.04),(.172,.164,z+.04)],-.009,7,'chest')
        b.plate([(.183,.174,z+.009),(.22,.17,z+.009),(.22,.17,z+.03),(.183,.174,z+.03)],-.005,4,'chest')
    # Rear pouch on LEFT hip, behind the user's mandatory left-front ember vessel.
    pouch_start=len(b.v)
    b.loft([(.247,.153,.782,.079,.049),(.25,.159,.877,.084,.054),(.231,.141,.942,.071,.047)],4,['pelvis']*3)
    b.plate([(.172,.209,.9),(.322,.211,.9),(.31,.214,.85),(.247,.218,.825),(.181,.211,.846)],-.012,4,'pelvis')
    for x in [.205,.281]:
        b.plate([(x-.01,.224,.877),(x+.012,.224,.877),(x+.012,.225,.808),(x-.01,.225,.808)],-.006,5,'pelvis')
    pouch_pivot=Vector((.25,.15,.942))
    for index in range(pouch_start,len(b.v)):
        b.v[index]=tuple(pouch_pivot+Quaternion(Vector((0,1,0)),math.radians(-10))@(Vector(b.v[index])-pouch_pivot))
    # The rear reference has one plain central cream-bordered panel, no star embroidery.
    w={'thigh.L':.5,'thigh.R':.5}
    panel=[[(-.099,.143,.956),(0,.155,.956),(.099,.143,.956)],
           [(-.096,.152,.746),(0,.162,.746),(.096,.152,.746)],
           [(-.087,.125,.515),(0,.146,.455),(.087,.125,.515)]]
    b.cloth(panel,[[w]*3]*3,3)
    for side in [0,2]:
        edge=[(row[side][0],row[side][1]+.018,row[side][2]) for row in panel]
        inside=[(x+(.022 if side==0 else -.022),y+.002,z+.004) for x,y,z in edge]
        b.cloth([[edge[i],inside[i]] for i in range(3)],[[w]*2]*3,6,.006)
    b.cloth([[(x,y+.023,z+.079) for x,y,z in panel[-1]],[(x,y+.024,z) for x,y,z in panel[-1]]],[[w]*3]*2,6,.006)
    return b


def make_head():
    b=MeshBuilder('SF_Head')
    # Hood rings run from facial opening to the rounded back. Seven perimeter vertices.
    front=[(0,-.241,1.941),(.158,-.264,1.884),(.263,-.265,1.568),(.13,-.233,1.487),(-.13,-.233,1.487),(-.263,-.265,1.568),(-.158,-.264,1.884)]
    mid=[(0,.01,1.954),(.173,.025,1.895),(.251,.072,1.582),(.153,.079,1.49),(-.153,.079,1.49),(-.251,.072,1.582),(-.173,.025,1.895)]
    back=[(0,.163,1.884),(.128,.173,1.818),(.225,.213,1.615),(.146,.186,1.51),(-.146,.186,1.51),(-.225,.213,1.615),(-.128,.173,1.818)]
    ids=[[b.vert(p,'head') for p in ring] for ring in (front,mid,back)]
    for j in range(2):
        for i in range(7):
            # A single hood-side star; preserve the rest as quiet teal cloth.
            tile=1 if j==0 and i==1 else 0
            b.face([ids[j][i],ids[j][(i+1)%7],ids[j+1][(i+1)%7],ids[j+1][i]],tile,
                   [(0,1),(0,0),(1,0),(1,1)] if tile==1 else None)
    # Crown and rear ridge replace the flat seven-sided rear cap.
    ridge_top=b.vert((0,.237,1.786),'head')
    ridge_low=b.vert((0,.241,1.611),'head')
    for indexes in [[ids[2][0],ids[2][1],ridge_top],[ids[2][0],ridge_top,ids[2][6]],
                    [ids[2][1],ids[2][2],ridge_low,ridge_top],
                    [ridge_top,ridge_low,ids[2][5],ids[2][6]],
                    [ids[2][2],ids[2][3],ridge_low],[ridge_low,ids[2][4],ids[2][5]],
                    [ids[2][3],ids[2][4],ridge_low]]:
        b.face(indexes,0)
    inner=[(x*.84,y+.022,1.705+(z-1.705)*.84) for x,y,z in front]
    innerids=[b.vert(p,'head') for p in inner]
    for i in range(7): b.face([ids[0][i],innerids[i],innerids[(i+1)%7],ids[0][(i+1)%7]],12)
    b.plate([(x,y+.044,z) for x,y,z in inner],.045,8,'head')
    # Three distinct ceramic plates. Center ridge projects; amber slits remain visible.
    # Explicit two-sided center ridge keeps the mask convex instead of an ngon fan.
    for s in [-1,1]:
        b.plate([(0,-.29,1.872),(s*.074,-.253,1.844),(s*.063,-.264,1.665),(0,-.283,1.55)],.022,6,'head')
    for s in [-1,1]:
        b.plate([(s*.086,-.253,1.832),(s*.15,-.233,1.807),(s*.158,-.239,1.675),(s*.036,-.277,1.573),(s*.046,-.274,1.636),(s*.073,-.269,1.686),(s*.09,-.263,1.738)],.02,6,'head')
        b.plate([(s*.077,-.266,1.805),(s*.086,-.266,1.755),(s*.066,-.27,1.686),(s*.063,-.27,1.718)],.005,10,'head')
    # Cowl neck ring is a compact chamfered scarf, head turn remains clear.
    b.loft([(0,0,1.397,.18,.143),(0,-.022,1.448,.25,.184),(0,0,1.488,.21,.164)],0,['neck']*3)
    return b


def make_arm(side,s):
    b=MeshBuilder('SF_Arm_'+side)
    upper='upper_arm.'+side; fore='forearm.'+side; hand='hand.'+side
    points=[(s*.263,0,1.386),(s*.312,0,1.344),(s*.36,-.001,1.285),(s*.408,-.005,1.221),
            (s*.444,-.008,1.164),(s*.456,-.01,1.131),(s*.495,-.013,1.055),(s*.535,-.012,.96)]
    b.tube(points,[(.073,.08),(.095,.093),(.094,.088),(.084,.076),(.065,.06),(.068,.062),(.076,.067),(.052,.049)],2,
           [{'chest':.25,upper:.75},upper,upper,upper,{upper:.6,fore:.4},{upper:.15,fore:.85},fore,fore])
    # Rear reference orientation: left ceramic shoulder, right teal cape.
    if side=='L':
        # Short ceramic shoulder shell, continuous around the deltoid, not a floating badge.
        b.cloth([[(s*.228,-.075,1.421),(s*.256,.005,1.49),(s*.235,.092,1.414)],
                 [(s*.329,-.118,1.383),(s*.365,.005,1.445),(s*.329,.104,1.374)],
                 [(s*.418,-.092,1.298),(s*.443,.005,1.335),(s*.405,.088,1.306)]],
                [[upper]*3]*3,6,thickness=.014)
        # Front lip overlaps the shell edge and lies outside the sleeve surface.
        b.bevel_plate([(s*.228,-.099,1.421),(s*.329,-.135,1.397),(s*.443,-.111,1.283),
                       (s*.35,-.141,1.296),(s*.265,-.12,1.354)],upper,depth=.016)
        b.plate([(s*.235,.106,1.414),(s*.329,.121,1.387),(s*.421,.11,1.30),
                 (s*.348,.129,1.31),(s*.273,.112,1.357)],-.014,6,upper)
    # Shaped leather vambrace, clear of the elbow crease, tapered toward wrist.
    b.tube([(s*.475,-.012,1.102),(s*.503,-.012,1.046),(s*.525,-.012,.997)],
           [(.08,.073),(.079,.071),(.063,.057)],4,[fore]*3)
    b.bevel_plate([(s*.415,-.069,1.116),(s*.464,-.075,1.138),(s*.522,-.083,1.076),
                   (s*.529,-.087,1.039),(s*.481,-.092,1.02),(s*.444,-.085,1.07)],fore,depth=.028)
    # A broad outward guard face makes the bracer read from the side as well.
    b.bevel_plate([(s*.552,-.035,1.116),(s*.594,-.045,1.055),(s*.585,.022,1.016),
                   (s*.548,.044,1.09)],fore,depth=.016)
    b.tube([(s*.526,-.012,.986),(s*.544,-.012,.945)],[(.067,.058),(.065,.056)],4,[fore,hand])
    # Chamfered palm.
    b.loft([(s*.568,-.008,.857,.043,.035),(s*.56,-.008,.91,.052,.041),(s*.54,-.008,.953,.041,.037)],8,[hand]*3)
    if side=='R':
        # Four distinct curled fingers, with tapered distal pads and raised knuckles.
        for j in range(4):
            z=.914-j*.023
            size=[1,1.04,.97,.84][j]
            b.tube([(s*.601,-.016,z),(s*.605,-.041,z-.001),(s*.590,-.070,z-.003),
                    (s*.565,-.085,z-.005),(s*.542,-.071,z-.006)],
                   [v*size for v in [.011,.014,.0125,.012,.0085]],8,
                   [hand,{hand:.35,'fingers.R':.65},'fingers.R','fingers.R','fingers.R'],n=6)
        b.tube([(s*.520,-.012,.931),(s*.510,-.038,.920),(s*.522,-.067,.906),(s*.548,-.084,.904)],
               [.019,.018,.016,.011],8,[hand,{hand:.35,'thumb.R':.65},'thumb.R','thumb.R'],n=6)
    else:
        for j in range(4):
            x=s*(.524+j*.025)
            length=[.074,.085,.080,.061][j]
            spread=[-.004,0,.004,.008][j]
            z=.875
            b.tube([(x,-.009,z),(x+s*spread,-.011,z-.021),
                    (x+s*(spread+.006),-.022,z-length*.60),
                    (x+s*(spread+.008),-.038,z-length*.87),
                    (x+s*(spread+.005),-.047,z-length)],
                   [.014,.015,.0125,.010,.0075],8,[hand,{hand:.25,'fingers.L':.75},'fingers.L','fingers.L','fingers.L'],n=6)
        b.tube([(s*.521,-.003,.925),(s*.497,-.012,.9),(s*.482,-.028,.878),(s*.485,-.047,.861)],
               [.02,.019,.015,.010],8,[hand,{hand:.3,'thumb.L':.7},'thumb.L','thumb.L'],n=6)
    # One inset leather reinforcement on the glove back, matching the reference.
    b.plate([(s*.561,.034,.927),(s*.580,.034,.908),(s*.566,.034,.889),(s*.548,.034,.908)],-.003,4,hand)
    return b


def socket(scene,rig,name,bone,position,direction=(0,0,1)):
    o=owned(bpy.data.objects.new(name,None)); scene.collection.objects.link(o)
    o.empty_display_type='ARROWS'; o.empty_display_size=.10
    o.parent=rig; o.parent_type='BONE'; o.parent_bone=bone
    bpy.context.view_layer.update()
    # Bone parenting includes the bone-tail offset; setting matrix_world derives it.
    direction=Quaternion(Vector((0,1,0)),math.radians(ARM_REST_INSET_DEGREES-WRIST_REST_COUNTER_DEGREES)*(1 if position[0]>=0 else -1))@Vector(direction)
    o.matrix_world=Matrix.Translation(Vector(anatomy(position,arm=True))) @ direction.to_track_quat('Z','Y').to_matrix().to_4x4()
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
    data.type='ORTHO'; data.ortho_scale=2.50; data.lens=55; scene.camera=cam
    return cam


def view(name='three_quarter'):
    scene=bpy.data.scenes[SCENE]; cam=scene.camera
    target=Vector((0,0,1.04))
    positions={'front':(0,-6,1.0),'side':(6,0,1.0),'back':(0,6,1.0),'three_quarter':(3,-5,3.05),'rear_quarter':(-3,5,2.7)}
    cam.location=positions[name]; cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            space.region_3d.view_distance=3.6
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
    scene['revision']='A15 hand finish: four distinct curled right fingers, articulated tapered left fingers, opposed thumbs and inset glove reinforcement; A14 body/cape and A13 arm rest retained'
    scene.frame_start=1; scene.frame_end=48
    print(json.dumps({'scene':scene.name,'bones':len(rig.data.bones),'meshes':[(o.name,len(o.data.vertices),len(o.data.polygons)) for o in objects]},indent=2))


if __name__=='__main__':
    build()
