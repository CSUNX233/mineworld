"""CC0 DevMops connected hand topology -> Starfire shared anatomy and atlas.
Run through existing Blender MCP. Original .blend/.zip remain unmodified.
"""
import bpy,runpy,math,bmesh
from mathutils import Vector,Matrix,Quaternion
sf=bpy.app.driver_namespace['sf'];base=runpy.run_path('D:/34229/mineworld/scripts/art/build_starfire_hero.py')
source=bpy.data.objects['Arm'];source_rig=bpy.data.objects['rig']
WRIST=Vector((-.514514625,-.391589135,.48071149))
def raw(p,side):
    d=Vector(p)-WRIST;s=1 if side=='L' else -1
    return Vector((s*.535+(-d.x if side=='L' else d.x)*.50,-.012-d.z*.50,.960+d.y*.50))
def target(p,side):return Vector(sf['anatomy'](raw(p,side),arm=True))
def mapped_matrix(matrix,length,side):
    head=matrix.translation;tail=head+matrix.to_3x3().col[1]*length
    h=target(head,side);y=(target(tail,side)-h).normalized()
    z=(target(head+matrix.to_3x3().col[2]*.02,side)-h).normalized()
    x=y.cross(z).normalized();z=x.cross(y).normalized()
    return Matrix.Translation(h) @ Matrix((x,y,z)).transposed().to_4x4()

# Pose with the downloaded Rigify controls and bake their evaluated transforms.
# The game never runs the 257-control authoring rig.
poses={}
source_scene=bpy.data.scenes['Starfire_Hand_Source'];bpy.context.window.scene=source_scene
source_rig.hide_set(False)
for side in ['L','R']:
    for digit in ['f_index','f_middle','f_ring','f_pinky','thumb']:
        p=source_rig.pose.bones[digit+'.01_master.R'];p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.scale=(1,1,1)
        if digit!='thumb':p.rotation_euler.x=math.radians(40 if side=='R' else 5);p.scale.y=.72 if side=='R' else .94
        elif side=='R':p.rotation_euler=(math.radians(-10),0,0);p.scale.y=.93
    bpy.context.view_layer.update()
    poses[side]={}
    for digit in ['f_index','f_middle','f_ring','f_pinky','thumb']:
        for joint in ['01','02','03']:
            p=source_rig.pose.bones['DEF-'+digit+'.'+joint+'.R']
            poses[side][digit+'.'+joint+'.'+side]=mapped_matrix(p.matrix,p.bone.length,side)
def pose_hands(rig):
    bpy.context.view_layer.update()
    for side in ['L','R']:
        hand=rig.pose.bones['hand.'+side]
        transform=hand.matrix @ hand.bone.matrix_local.inverted()
        for name,matrix in poses[side].items():
            p=rig.pose.bones[name];parent=p.parent
            parent_pose=transform @ poses[side][parent.name] if parent.name in poses[side] else hand.matrix
            p.matrix_basis=p.bone.matrix_local.inverted() @ parent.bone.matrix_local @ parent_pose.inverted() @ transform @ matrix
sf['pose_hands']=pose_hands
def fp_grip_orientation(rig):
    # The approved palm view: four curled fingers screen-left, thumb upper-right.
    origin=target(WRIST,'R')
    y=(target(WRIST+Vector((0,.02,0)),'R')-origin).normalized()
    x=(target(WRIST+Vector((.02,0,0)),'R')-origin).normalized()
    z=x.cross(y).normalized();x=y.cross(z).normalized()
    initial=Matrix((x,y,z)).transposed()
    desired=Matrix((Vector((0,0,1)),Vector((-1,0,0)),Vector((0,-1,0)))).transposed()
    desired=Quaternion((0,0,1),-math.pi/2).to_matrix() @ desired
    bpy.context.view_layer.update()
    hand=rig.pose.bones['hand.R']
    # Keep the forearm and elbow pose unchanged; position only the camera hand.
    wrist=hand.matrix.translation.copy()
    hand.matrix=Matrix.Translation(wrist) @ (desired @ initial.transposed() @ hand.bone.matrix_local.to_3x3()).to_4x4()
sf['fp_grip_orientation']=fp_grip_orientation
def correct_grip(rig,obj,grip):
    """Small inverse-skin corrective for thumb pads contacting the cylinder.
    Original downloaded mesh is preserved; only adapted glove vertices change.
    """
    bpy.context.view_layer.update()
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    inv=grip.matrix_world.inverted();changes=[]
    for v in mesh.vertices:
        src=obj.data.vertices[v.index]
        thumb=sum(g.weight for g in src.groups if obj.vertex_groups[g.group].name.startswith('thumb.'))
        if thumb<.3:continue
        p=inv @ (ev.matrix_world @ v.co);radius=p.xy.length
        if abs(p.z)>.10 or radius>=.0159 or radius<1e-6:continue
        p.x*=.016/radius;p.y*=.016/radius
        skin=Matrix(((0,0,0,0),)*4);total=sum(g.weight for g in src.groups)
        for g in src.groups:
            bone=rig.pose.bones[obj.vertex_groups[g.group].name]
            skin+=(bone.matrix @ bone.bone.matrix_local.inverted())*(g.weight/total)
        changes.append((v.index,skin.inverted() @ (obj.matrix_world.inverted() @ (grip.matrix_world @ p))))
    ev.to_mesh_clear()
    for i,p in changes:obj.data.vertices[i].co=p
    obj.data.update();bpy.context.view_layer.update()
    print('Thumb contact corrective:',obj.name,len(changes),'vertices')
sf['correct_grip']=correct_grip

def add_bones(rig):
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for side in ['L','R']:
        for digit in ['f_index','f_middle','f_ring','f_pinky','thumb']:
            for joint in ['01','02','03']:
                name=digit+'.'+joint+'.'+side
                src=source_rig.data.bones['DEF-'+digit+'.'+joint+'.R']
                b=rig.data.edit_bones.get(name) or rig.data.edit_bones.new(name);b.head=target(src.head_local,side);b.tail=target(src.tail_local,side)
                b.parent=rig.data.edit_bones['hand.'+side if joint=='01' else digit+'.'+str(int(joint)-1).zfill(2)+'.'+side]
                b.align_roll(mapped_matrix(src.matrix_local,src.length,side).to_3x3().col[2]);b.use_deform=True
    bpy.ops.object.mode_set(mode='OBJECT')
def make_rig(scene):
    rig=base['make_rig'](scene);add_bones(rig);return rig
def make_arm(side,s):
    b=base['make_arm'](side,s)
    # Keep the approved upper arm/armor and wrist bridge only.
    hand_vertex=[sum(v for k,v in w.items() if k.startswith(('hand.','fingers.','thumb.')))>.99 for w in b.w]
    keep=[i for i,f in enumerate(b.f) if not all(hand_vertex[v] for v in f)]
    b.f=[b.f[i] for i in keep];b.tiles=[b.tiles[i] for i in keep];b.uv=[b.uv[i] for i in keep]
    indices={}
    for poly in source.data.polygons:
        if not all(source.data.vertices[i].co.y < -.32 for i in poly.vertices):continue
        face=[]
        for i in poly.vertices:
            if i not in indices:
                v=source.data.vertices[i];weights={}
                for g in v.groups:
                    if g.weight<.001:continue
                    name=source.vertex_groups[g.group].name
                    if name.startswith(('DEF-f_','DEF-thumb.')):name=name[4:-1]+side
                    elif name.startswith('DEF-forearm'):name='forearm.'+side
                    else:name='hand.'+side
                    weights[name]=weights.get(name,0)+g.weight
                indices[i]=b.vert(raw(v.co,side),weights or {'hand.'+side:1})
            face.append(indices[i])
        b.face(face[::-1] if side=='L' else face,3)
    return b

sf['make_rig']=make_rig;sf['make_arm']=make_arm
scene=bpy.data.scenes['Starfire_Stage_A'];bpy.context.window.scene=scene
bpy.app.driver_namespace['sf_review']['reset']()
rig=bpy.data.objects['SF_Rig'];add_bones(rig)
for side,s in [('L',1),('R',-1)]:
    old=bpy.data.objects['SF_Arm_'+side];assert old.get('starfire_stage_a');bpy.data.objects.remove(old,do_unlink=True)
    o=make_arm(side,s).finish(scene,bpy.data.materials['SF_Atlas'],rig)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(o.data);bm.free()
    o['source']='DevMops Low Poly Arms (Rigged), CC0; connected hand topology, adapted glove'
# Grip axis runs across the palm toward the thumb, as on a real power grip.
for name in ['SF_Grip_R','SF_AttackAxis_R']:
    old=bpy.data.objects[name];children=list(old.children)
    bpy.data.objects.remove(old,do_unlink=True)
    grip=sf['socket'](scene,rig,name,'hand.R',(-.535,.010,.884),(1,0,0))
    grip.matrix_world=grip.matrix_world @ Matrix.Translation((.016,.018,0))
    for child in children:
        child.parent=grip;child.matrix_parent_inverse.identity();child.location=(0,0,0);child.rotation_euler=(0,0,0)
print('CC0 source hand topology installed; 60-bone shared skeleton; real transverse grip axis')
