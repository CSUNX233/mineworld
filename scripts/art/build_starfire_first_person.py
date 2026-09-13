"""Independent first-person hands, authored from approved glove design."""
import bpy,runpy,json
from mathutils import Vector,Matrix
sf=bpy.app.driver_namespace['sf']; ROOT=sf['ROOT']; OUT=sf['OUT']
source=bpy.context.window.scene
scene=bpy.data.scenes.get('Starfire_FirstPerson')
if not scene:scene=bpy.data.scenes.new('Starfire_FirstPerson');scene['starfire_stage_a']=True
assert scene.get('starfire_stage_a')
bpy.context.window.scene=scene
for obj in list(scene.objects):
 if obj.get('starfire_stage_a'):bpy.data.objects.remove(obj,do_unlink=True)
rig=sf['make_rig'](scene);rig.name='SF_FP_Rig'
mat=bpy.data.materials['SF_Atlas'].copy();mat.name='SF_FP_Atlas';mat['starfire_stage_a']=True
for side,sign in [('L',1),('R',-1)]:
 # MeshBuilder applies arm rest/proportions by this prefix, matching bone/socket space.
 b=sf['make_arm'](side,sign);b.name='SF_Arm_FP_'+side
 # Camera asset is HANDS ONLY. Keep the connected downloaded hand component,
 # then cut at the wrist; none of the legacy forearm/armor islands are retained.
 adjacent={}
 for face in b.f:
  for i in face:adjacent.setdefault(i,set()).update(face)
 seeds=[i for i,w in enumerate(b.w) if any(n.startswith('f_index.') for n in w) and i in adjacent]
 component=set(seeds);todo=list(seeds)
 while todo:
  for i in adjacent[todo.pop()]:
   if i not in component:component.add(i);todo.append(i)
 keep=[i in component and sum(v for name,v in weights.items() if name.startswith(('hand.','fingers.','thumb.','f_index.','f_middle.','f_ring.','f_pinky.')))>.5 for i,weights in enumerate(b.w)]
 faces=[i for i,f in enumerate(b.f) if all(keep[v] for v in f)]
 b.f=[b.f[i] for i in faces];b.tiles=[b.tiles[i] for i in faces];b.uv=[b.uv[i] for i in faces]
 # Shared anatomical hand construction; preserve exact grip-space dimensions.
 obj=b.finish(scene,mat,rig)
 obj.name='SF_FP_Hand_'+side
 # Remove orphaned upper-arm vertices so the camera mesh has tight bounds.
 import bmesh
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 boundary=[e for e in bm.edges if e.is_boundary]
 if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 obj['first_person_only']=True
grip=sf['socket'](scene,rig,'FP_Grip_R','hand.R',(-.535,.010,.884),(1,0,0))
grip.matrix_world=grip.matrix_world @ Matrix.Translation((.016,.018,0))
sf['socket'](scene,rig,'FP_Skill_L','hand.L',(.559,-.049,.843),(0,-1,0))
for obj in scene.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
# Copy authored held pose for editable preview, preserving the original third-person scene.
bpy.context.window.scene=source
bpy.app.driver_namespace['sf_motion']['pose']('FP_Pose',0)
original=bpy.data.objects['SF_Rig']
for bone in rig.pose.bones:
 bone.rotation_mode='QUATERNION';bone.rotation_quaternion=original.pose.bones[bone.name].rotation_quaternion
 bone.location=original.pose.bones[bone.name].location
bpy.context.window.scene=scene
if sf.get('correct_grip'):sf['correct_grip'](rig,bpy.data.objects['SF_FP_Hand_R'],grip)
preview_pose={p.name:(p.location.copy(),p.rotation_quaternion.copy()) for p in rig.pose.bones}
for p in rig.pose.bones:p.location.zero();p.rotation_quaternion.identity()
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/actors/starfire/starfire-first-person.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_skins=True,export_yup=True,export_extras=True,export_def_bones=False,export_leaf_bone=False)
for p in rig.pose.bones:p.location,p.rotation_quaternion=preview_pose[p.name]
bpy.context.view_layer.update()
scene.world=source.world
scene.view_settings.view_transform='Standard'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  region=area.spaces.active.region_3d
  region.view_rotation=Vector((0,1,-.2)).to_track_quat('-Z','Y');region.view_distance=2.4;region.view_location=Vector((0,-.3,1.38));region.update()
path=OUT/'review/stage-b';path.mkdir(exist_ok=True)
bpy.types.blendermcp_server.get_viewport_screenshot(max_size=1400,filepath=str(path/'fp-hands-blender.png'),format='png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'starfire-first-person.blend'),copy=True)
report={'meshes':2,'bones':len(rig.data.bones),'triangles':0,'materialCount':1}
for obj in scene.objects:
 if obj.type=='MESH':obj.data.calc_loop_triangles();report['triangles']+=len(obj.data.loop_triangles)
(OUT/'first-person-checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.context.window.scene=source
print(report)
