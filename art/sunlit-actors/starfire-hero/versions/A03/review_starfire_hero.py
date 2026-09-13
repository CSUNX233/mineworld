"""Stage A rig inspection/export, invoked through the live Blender MCP session.
These are inspection poses, not gameplay movement/attack animation clips.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix

ROOT=Path('D:/34229/mineworld')
OUT=ROOT/'art/sunlit-actors/starfire-hero'
ASSETS=ROOT/'public/assets/actors/starfire'
SCENE='Starfire_Stage_A'


def reset():
    rig=bpy.data.objects['SF_Rig']
    rig.animation_data_clear()
    for p in rig.pose.bones:
        p.location=(0,0,0); p.rotation_mode='QUATERNION'; p.rotation_quaternion=(1,0,0,0); p.scale=(1,1,1)
    for kind in ['Sword','Staff']:
        obj=bpy.data.objects['SF_Proxy_'+kind]
        obj.hide_set(kind=='Staff'); obj.hide_render=kind=='Staff'
    bpy.context.view_layer.update()


def rotate(name,axis,degrees):
    p=bpy.data.objects['SF_Rig'].pose.bones[name]
    basis=p.bone.matrix_local.to_quaternion()
    p.rotation_quaternion=basis.inverted() @ Quaternion(Vector(axis),math.radians(degrees)) @ basis


def pose(name,amount=1):
    reset(); rig=bpy.data.objects['SF_Rig']; a=amount
    if name in ['flex','crouch','staff']:
        pelvis=rig.pose.bones['pelvis']
        pelvis.location=pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0,0,-.15*a))
        for side in ['L','R']:
            rotate('thigh.'+side,(1,0,0),-38*a)
            rotate('shin.'+side,(1,0,0),72*a)
            rotate('foot.'+side,(1,0,0),-34*a)
        rotate('spine',(1,0,0),12*a)
        rotate('chest',(1,0,0),-6*a)
        rotate('neck',(1,0,0),-6*a)
        rotate('tabard',(1,0,0),-28*a)
        rotate('cape.upper',(1,0,0),18*a)
        rotate('cape.lower',(1,0,0),8*a)
    if name in ['flex','staff']:
        rotate('upper_arm.R',(0,1,0),26*a)
        rotate('forearm.R',(1,0,0),-83*a)
        rotate('upper_arm.L',(0,1,0),-40*a)
        rotate('forearm.L',(1,0,0),-67*a)
        rotate('head',(0,0,1),12*a)
    if name=='reach':
        rotate('upper_arm.L',(1,0,0),-65*a)
        rotate('forearm.L',(1,0,0),-25*a)
        rotate('upper_arm.R',(0,1,0),55*a)
        rotate('forearm.R',(1,0,0),-75*a)
        rotate('chest',(0,0,1),-18*a)
        rotate('head',(0,0,1),18*a)
    if name=='staff':
        # Grip remains the same; align right hand so the staff long axis rises.
        rotate('hand.R',(1,0,0),-80*a)
        for kind in ['Sword','Staff']:
            o=bpy.data.objects['SF_Proxy_'+kind]; o.hide_set(kind=='Sword'); o.hide_render=kind=='Sword'
    bpy.context.view_layer.update()


def capture(label,view='three_quarter',pose_name='rest',amount=1):
    if pose_name=='rest': reset()
    else: pose(pose_name,amount)
    bpy.app.driver_namespace['sf']['view'](view)
    path=OUT/'review'/label
    path.parent.mkdir(parents=True,exist_ok=True)
    # Same installed addon's viewport screenshot function used by the MCP tool.
    result=bpy.types.blendermcp_server.get_viewport_screenshot(max_size=1600,filepath=str(path.with_suffix('.png')),format='png')
    if not result.get('success'): raise RuntimeError(result)
    print('VIEWPORT_SAVED',str(path.with_suffix('.png')))


def rig_report():
    scene=bpy.data.scenes[SCENE]; rig=bpy.data.objects['SF_Rig']
    report={'stage':'A','revision':scene['revision'],'boneCount':len(rig.data.bones),
            'deformBoneCount':sum(b.use_deform for b in rig.data.bones),
            'atlas':[256,256],'bodyMeshes':[],'sockets':{},'inspectionPoses':[],
            'gameplayAnimations':0,'runtimeIntegrated':False,'mobilePerformanceMeasured':False}
    for o in scene.objects:
        if o.type!='MESH' or not o.name.startswith(('SF_Body','SF_Head','SF_Arm')): continue
        o.data.calc_loop_triangles()
        bad=[]; max_weights=0
        for v in o.data.vertices:
            weights=[g.weight for g in v.groups if g.weight>0]
            max_weights=max(max_weights,len(weights))
            if abs(sum(weights)-1)>1e-5: bad.append(v.index)
        report['bodyMeshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),
                                    'materialSlots':len(o.data.materials),'maxInfluences':max_weights,'invalidWeights':bad,
                                    'firstPersonVisible':bool(o.get('first_person_visible'))})
    for name in ['SF_Grip_R','SF_Skill_L','SF_AttackAxis_R','SF_StaffMuzzle','SF_BladeTip']:
        o=bpy.data.objects[name]
        report['sockets'][name]={'parent':o.parent.name,'bone':o.parent_bone,
                                 'localPosition':list(o.location),'worldPosition':list(o.matrix_world.translation)}
    for name,amount in [('rest',1),('flex',.5),('flex',1),('reach',1),('staff',1)]:
        reset() if name=='rest' else pose(name,amount)
        deps=bpy.context.evaluated_depsgraph_get(); bad=[]
        for o in scene.objects:
            if o.type!='MESH' or not o.name.startswith(('SF_Body','SF_Head','SF_Arm')): continue
            evaluated=o.evaluated_get(deps); mesh=evaluated.to_mesh()
            if any(not math.isfinite(c) for v in mesh.vertices for c in v.co): bad.append(o.name)
            evaluated.to_mesh_clear()
        grip=bpy.data.objects['SF_Grip_R'].matrix_world
        proxy=bpy.data.objects['SF_Proxy_Staff' if name=='staff' else 'SF_Proxy_Sword'].matrix_world
        error=(grip.translation-proxy.translation).length
        report['inspectionPoses'].append({'name':name,'amount':amount,'nonFiniteMeshes':bad,'gripOriginErrorMeters':error})
        assert error<1e-6 and not bad
    reset()
    report['totalBodyTriangles']=sum(m['triangles'] for m in report['bodyMeshes'])
    report['totalBodyVertices']=sum(m['vertices'] for m in report['bodyMeshes'])
    report['sharedMaterials']=len({m.name for o in scene.objects if o.type=='MESH' and o.get('starfire_stage_a') for m in o.data.materials})
    report['proxyWeapons']={}
    for kind in ['Sword','Staff']:
        o=bpy.data.objects['SF_Proxy_'+kind]; o.data.calc_loop_triangles()
        report['proxyWeapons'][kind]={'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)}
    (OUT/'stage-a-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report


def inspection_action():
    """A reusable weight-test action, deliberately excluded from the GLB."""
    rig=bpy.data.objects['SF_Rig']
    name='QA_StageA_Flex_Only'
    old=bpy.data.actions.get(name)
    if old:
        if not old.get('starfire_stage_a'): raise RuntimeError('Action name belongs to user')
        rig.animation_data_clear(); bpy.data.actions.remove(old)
    action=bpy.data.actions.new(name); action['starfire_stage_a']=True; action.use_fake_user=True
    scene=bpy.data.scenes[SCENE]
    for frame,amount in [(1,0),(12,.5),(24,1),(36,.5),(48,0)]:
        pose('flex',amount)
        rig.animation_data_create(); rig.animation_data.action=action
        for p in rig.pose.bones:
            p.keyframe_insert('location',frame=frame,group=p.name)
            p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
    scene.frame_set(1)
    for frame,label in [(1,'REST'),(12,'HALF FLEX'),(24,'FULL FLEX'),(36,'HALF RECOVERY'),(48,'REST')]:
        if not scene.timeline_markers.get(label): scene.timeline_markers.new(label,frame=frame)
    bpy.context.view_layer.update()


def export():
    reset(); scene=bpy.data.scenes[SCENE]
    bpy.context.window.scene=scene
    for o in scene.objects: o.select_set(False)
    selected=[]
    for o in scene.objects:
        if o.name in ['SF_Rig','SF_Body','SF_Head','SF_Arm_L','SF_Arm_R','SF_Grip_R','SF_Skill_L','SF_AttackAxis_R']:
            o.hide_set(False); o.select_set(True); selected.append(o)
    bpy.context.view_layer.objects.active=bpy.data.objects['SF_Rig']
    # Export only runtime body + rig + sockets; proxy weapons are independent assets.
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/'starfire-hero.glb'),export_format='GLB',use_selection=True,use_active_scene=True,
        export_animations=False,export_skins=True,export_yup=True,export_extras=True,
        export_def_bones=False,export_leaf_bone=False,export_apply=False)
    for kind in ['Sword','Staff']:
        for o in scene.objects: o.select_set(False)
        weapon=bpy.data.objects['SF_Proxy_'+kind]
        tip=bpy.data.objects['SF_StaffMuzzle' if kind=='Staff' else 'SF_BladeTip']
        # Temporary duplicate is only for export with a true origin; remove immediately.
        duplicate=weapon.copy(); duplicate.data=weapon.data; scene.collection.objects.link(duplicate)
        duplicate.parent=None; duplicate.matrix_world=Matrix.Identity(4); duplicate.hide_set(False); duplicate.hide_render=False
        duplicate.select_set(True)
        marker=tip.copy(); scene.collection.objects.link(marker); marker.parent=duplicate; marker.matrix_parent_inverse=Matrix.Identity(4)
        marker.location=tip.location.copy(); marker.select_set(True)
        try:
            bpy.ops.export_scene.gltf(filepath=str(ASSETS/('proxy-'+kind.lower()+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,
                export_animations=False,export_extras=True,export_yup=True)
        finally:
            bpy.data.objects.remove(marker,do_unlink=True); bpy.data.objects.remove(duplicate,do_unlink=True)
    for o in scene.objects: o.select_set(False)
    bpy.context.view_layer.objects.active=bpy.data.objects['SF_Rig']
    bpy.app.driver_namespace['sf']['view']('three_quarter')
    inspection_action()
    # Full project copy preserves the user's original scene as well as production.
    # copy=True leaves the current unsaved session file path unchanged.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'starfire-stage-a.blend'),copy=True)
    print('STAGE_A_EXPORTED; original current filepath:',repr(bpy.data.filepath))


if __name__=='__main__':
    rig_report()
