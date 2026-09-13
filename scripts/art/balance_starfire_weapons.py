"""Balance presentation geometry around the unchanged 12 mm grip/contact origin."""
import bpy,runpy
from pathlib import Path
root=Path('D:/34229/mineworld')
scene=bpy.data.scenes['Starfire_Stage_A'];bpy.context.window.scene=scene
def sword_z(z):
    if z>.105:return .08375+(z-.105)*.78
    if z>.02:return .02+(z-.02)*.75
    if z<-.065:return -.065+(z+.065)*.65
    return z
for kind in ['Sword','Staff']:
    obj=bpy.data.objects['SF_Proxy_'+kind]
    if obj.get('proportion_revision')==2:continue
    if obj.get('proportion_revision')==1:
        if kind=='Sword':
            for v in obj.data.vertices:
                if abs(v.co.z-.08)<.0001 and v.co.xy.length>.02:
                    v.co.x*=.65;v.co.y*=.75
        obj.data.update();obj['proportion_revision']=2
        continue
    for v in obj.data.vertices:
        z=v.co.z
        if kind=='Sword':
            if z>=.104 or (z>=.099 and v.co.xy.length>.02):v.co.x*=.65;v.co.y*=.75
            elif z<=-.104:v.co.x*=.65;v.co.y*=.65
            v.co.z=sword_z(z)
        elif z>.45:
            v.co.x*=.72;v.co.y*=.72;v.co.z=.45+(z-.45)*.8
        elif z<-.10:v.co.z=-.10+(z+.10)*.82
    marker=bpy.data.objects['SF_BladeTip' if kind=='Sword' else 'SF_StaffMuzzle']
    if kind=='Sword':marker.location.z=sword_z(marker.location.z)
    elif marker.location.z>.45:marker.location.z=.45+(marker.location.z-.45)*.8
    obj.data.update();obj['proportion_revision']=2
runpy.run_path(str(root/'scripts/art/fit_starfire_grips.py'))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'art/sunlit-actors/starfire-hero/starfire-weapons.blend'),copy=True)
print('Balanced weapon silhouettes exported; grip radius and gameplay values unchanged.')
