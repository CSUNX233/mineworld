"""Fit proxy handle radii to the approved rigged grasp, preserving blade/head."""
import bpy
from mathutils import Matrix
from pathlib import Path
scene=bpy.data.scenes['Starfire_Stage_A'];bpy.context.window.scene=scene
out=Path('D:/34229/mineworld/public/assets/actors/starfire')
for kind,old_radius in [('Sword',.025),('Staff',.023)]:
    weapon=bpy.data.objects['SF_Proxy_'+kind]
    if not weapon.get('grip_fitted'):
        for v in weapon.data.vertices:
            r=(v.co.x*v.co.x+v.co.y*v.co.y)**.5
            if kind=='Sword' and -.106<=v.co.z<=.106 and r<=.0251:
                v.co.x*=.012/old_radius;v.co.y*=.012/old_radius
            elif kind=='Staff' and r<=.034 and v.co.z<.54:
                v.co.x*=.012/old_radius;v.co.y*=.012/old_radius
        weapon.data.update();weapon['grip_fitted']=True;weapon['handle_radius']=.012
    for o in scene.objects:o.select_set(False)
    tip=bpy.data.objects['SF_StaffMuzzle' if kind=='Staff' else 'SF_BladeTip']
    duplicate=weapon.copy();scene.collection.objects.link(duplicate);duplicate.parent=None;duplicate.matrix_world=Matrix.Identity(4);duplicate.hide_set(False);duplicate.hide_render=False;duplicate.select_set(True)
    marker=tip.copy();scene.collection.objects.link(marker);marker.parent=duplicate;marker.matrix_parent_inverse=Matrix.Identity(4);marker.location=tip.location.copy();marker.select_set(True)
    try:
        bpy.ops.export_scene.gltf(filepath=str(out/('proxy-'+kind.lower()+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_extras=True,export_yup=True)
    finally:
        bpy.data.objects.remove(marker,do_unlink=True);bpy.data.objects.remove(duplicate,do_unlink=True)
print('12 mm handles exported; blade/staff head dimensions retained')
