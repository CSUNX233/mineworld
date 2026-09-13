"""Author Stage B clips in the live MCP-owned scene. Never launch Blender."""
import bpy, math, json, runpy
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix
ROOT=Path('D:/34229/mineworld')
OUT=ROOT/'art/sunlit-actors/starfire-hero'
r=bpy.app.driver_namespace.get('sf_review') or runpy.run_path(str(ROOT/'scripts/art/review_starfire_hero.py'))
rig=bpy.data.objects['SF_Rig']; scene=bpy.data.scenes['Starfire_Stage_A']
SPECS={'Idle':2.4,'Walk':.88,'Run':.62,'Jump_Start':.12,'Jump_Rise':.3,'Jump_Apex':.16,'Jump_Fall':.4,'Land_Light':.24,'Land_Heavy':.42,'FP_Pose':.1,'Staff_Hold':.1}

def pose(name,t):
    r['reset'](); rot=r['rotate']; phase=t*math.tau
    feet=[rig.pose.bones['foot.'+s].matrix.translation.copy() for s in ['L','R']]
    if name=='Idle':
        rot('chest',(1,0,0),math.sin(phase)*1.3);rot('cape.lower',(1,0,0),math.sin(phase-.5)*2)
    elif name in ('Walk','Run'):
        run=name=='Run'; amplitude=37 if run else 25
        for side,offset in [('L',0),('R',math.pi)]:
            a=phase+offset;s=math.sin(a)
            thigh=amplitude*s; knee=5+max(0,math.cos(a))*(65 if run else 40)
            rot('thigh.'+side,(1,0,0),thigh);rot('shin.'+side,(1,0,0),knee)
            rot('foot.'+side,(1,0,0),-thigh-knee+max(0,-s)*12)
            rot('upper_arm.'+side,(1,0,0),-s*(20 if run else 12)-5)
            rot('forearm.'+side,(1,0,0),-18 if run else -8)
        rot('spine',(1,0,0),12 if run else 3)
        rot('chest',(0,0,1),math.sin(phase)*3)
        rot('cape.upper',(1,0,0),-9 if run else -3)
        rot('cape.lower',(1,0,0),-6+math.sin(phase-.6)*5)
        bpy.context.view_layer.update()
        dz=min(p.z for p in feet)-min(rig.pose.bones['foot.'+s].matrix.translation.z for s in ['L','R'])
        rig.pose.bones['pelvis'].location=rig.data.bones['pelvis'].matrix_local.to_3x3().inverted()@Vector((0,0,dz))
    elif name in ('Land_Light','Land_Heavy','Jump_Start'):
        amount=(math.sin(min(1,t/.32)*math.pi/2)*(1-max(0,(t-.32)/.68)) if name!='Jump_Start' else (1-t))
        r['pose']('flex',amount*(.85 if name=='Land_Heavy' else .36))
    elif name.startswith('Jump_'):
        k={'Jump_Rise':( -36,60,-18,37), 'Jump_Apex':(-25,55,-35,65),'Jump_Fall':(-12,20,8,25)}[name]
        for side,thigh,knee in [('L',k[0],k[1]),('R',k[2],k[3])]:
            rot('thigh.'+side,(1,0,0),thigh);rot('shin.'+side,(1,0,0),knee);rot('foot.'+side,(1,0,0),-thigh-knee+8)
            rot('upper_arm.'+side,(1,0,0),-18);rot('forearm.'+side,(1,0,0),-25)
        rot('spine',(1,0,0),8);rot('cape.upper',(1,0,0),-12);rot('cape.lower',(1,0,0),-15+3*math.sin(phase))
    elif name=='Staff_Hold':
        rot('upper_arm.R',(1,0,0),-10)
        rot('forearm.R',(1,0,0),-65)
        rot('hand.R',(1,0,0),-65)
    elif name=='FP_Pose':
        # Translate the entire right camera arm without twisting or stretching it.
        p=rig.pose.bones['clavicle.R']
        p.location=p.bone.matrix_local.to_3x3().inverted() @ Vector((0,-.10,.18))
        left=rig.pose.bones['clavicle.L']
        left.location=left.bone.matrix_local.to_3x3().inverted() @ Vector((0,-.10,.12))
        for side in ['L','R']:
            rot('upper_arm.'+side,(1,0,0),-80);rot('forearm.'+side,(1,0,0),-30)
        rot('hand.R',(1,0,0),0)
        rot('hand.L',(1,0,0),25)
        # Supinate the open support hand: palm visible, thumb on screen-left.
        rig.pose.bones['forearm.L'].rotation_quaternion @= Quaternion((0,1,0),math.pi)
    if 'f_index.01.R' in rig.pose.bones:
        rig.pose.bones['forearm.R'].rotation_quaternion @= Quaternion((0,1,0),math.pi/2)
        if name=='FP_Pose' and bpy.app.driver_namespace['sf'].get('fp_grip_orientation'):
            bpy.app.driver_namespace['sf']['fp_grip_orientation'](rig)
    if bpy.app.driver_namespace['sf'].get('pose_hands'):
        bpy.app.driver_namespace['sf']['pose_hands'](rig)
    bpy.context.view_layer.update()

def build():
    scene.render.fps=30
    for name,duration in SPECS.items():
        old=bpy.data.actions.get(name)
        if old:
            assert old.get('starfire_stage_a');rig.animation_data_clear();bpy.data.actions.remove(old)
        action=bpy.data.actions.new(name);action['starfire_stage_a']=True;action.use_fake_user=True
        count=round(duration*30)
        for frame in range(count+1):
            pose(name,frame/count);rig.animation_data_create();rig.animation_data.action=action
            for p in rig.pose.bones:
                p.keyframe_insert('location',frame=frame,group=p.name);p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
    pose('Idle',0)
    if bpy.app.driver_namespace['sf'].get('correct_grip'):
        bpy.app.driver_namespace['sf']['correct_grip'](rig,bpy.data.objects['SF_Arm_R'],bpy.data.objects['SF_Grip_R'])
    r['reset']()
    for o in scene.objects:o.select_set(o.name in ['SF_Rig','SF_Body','SF_Head','SF_Arm_L','SF_Arm_R','SF_Grip_R','SF_Skill_L','SF_AttackAxis_R'])
    bpy.context.view_layer.objects.active=rig
    # NLA strips export exactly the production list, never Stage A QA action.
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(track)
    for name in SPECS:
        track=rig.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,0,bpy.data.actions[name]);strip.name=name
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/actors/starfire/starfire-motion.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_yup=True,export_extras=True,export_def_bones=False,export_leaf_bone=False)
    for track in rig.animation_data.nla_tracks:track.mute=True
    rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_start=0;scene.frame_end=72;scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'starfire-stage-b.blend'),copy=True)
    (OUT/'stage-b-clips.json').write_text(json.dumps(SPECS,indent=2),encoding='utf-8')

def capture(name,t,view='three_quarter',suffix=''):
    pose(name,t);bpy.app.driver_namespace['sf']['view'](view)
    dest=OUT/'review/stage-b';dest.mkdir(exist_ok=True)
    bpy.types.blendermcp_server.get_viewport_screenshot(max_size=1400,filepath=str(dest/(name+'_'+str(t)+suffix+'.png')),format='png')

if __name__=='__main__':build()
