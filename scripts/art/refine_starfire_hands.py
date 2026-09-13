"""Replace only owned arm meshes through MCP; preserve approved body and rig.

Palm wedge, separate thenar mass, nonparallel finger joints and a cylindrical
power grip. First-person and world hands use this same anatomical construction.
"""
import bpy, math, runpy
from mathutils import Vector

sf=bpy.app.driver_namespace['sf']
base=runpy.run_path('D:/34229/mineworld/scripts/art/build_starfire_hero.py')

def finger(b,points,radii,tile,weights,n=8):
    """Rings follow each joint tangent rather than one axis for a bent finger."""
    ids=[]
    for j,p in enumerate(points):
        tangent=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized()
        u=tangent.cross(Vector((0,0,1)))
        if u.length<.1:u=tangent.cross(Vector((0,1,0)))
        u.normalize();v=tangent.cross(u).normalized()
        ids.append([b.vert(Vector(p)+radii[j]*(u*math.cos(k*2*math.pi/n)+v*math.sin(k*2*math.pi/n)),weights[j]) for k in range(n)])
    for a,c in zip(ids,ids[1:]):
        for k in range(n):b.face([a[k],a[(k+1)%n],c[(k+1)%n],c[k]],tile)
    b.face(ids[0][::-1],tile);b.face(ids[-1],tile)

def make_arm(side,s):
    b=base['make_arm'](side,s)
    hand='hand.'+side;fingers='fingers.'+side;thumb='thumb.'+side
    # Remove the previous glove; preserve wrist bridge and all approved arm armor.
    is_hand=[sum(v for k,v in w.items() if k.startswith(('hand.','fingers.','thumb.')))>.99 for w in b.w]
    keep=[i for i,f in enumerate(b.f) if not all(is_hand[v] for v in f)]
    b.f=[b.f[i] for i in keep];b.tiles=[b.tiles[i] for i in keep];b.uv=[b.uv[i] for i in keep]
    if side=='L':
        b.loft([(s*.54,-.007,.952,.035,.029),(s*.551,-.007,.915,.049,.032),
                (s*.565,-.009,.875,.049,.027),(s*.567,-.011,.859,.041,.024)],3,[hand]*4)
        # Knuckle arch and natural relaxed cascade, not four straight parallel rods.
        for j,(x,z,length) in enumerate([(.529,.873,.065),(.554,.866,.076),(.580,.862,.068),(.602,.871,.052)]):
            curl=[.032,.042,.048,.044][j];spread=[-.006,-.002,.001,.004][j]
            pts=[(s*x,-.008,z),(s*(x+spread),-.017,z-.023),
                 (s*(x+spread),-curl,z-length*.72),(s*(x+spread-.004),-curl-.020,z-length*.93),
                 (s*(x+spread-.005),-curl-.027,z-length)]
            finger(b,pts,[.0135,.014,.012,.0105,.007],3,[hand,{hand:.45,fingers:.55},fingers,fingers,fingers])
        # Broad thumb saddle flowing into palm; tip points inward toward fingers.
        finger(b,[(s*.529,-.003,.928),(s*.509,-.015,.907),(s*.492,-.033,.885),
                  (s*.496,-.055,.868),(s*.512,-.065,.861)],
               [.023,.024,.019,.015,.010],3,[hand,hand,{hand:.4,thumb:.6},thumb,thumb])
    else:
        # Dorsal wedge reaches the four knuckles; palm cups the back of the grip.
        b.loft([(s*.577,-.006,.850,.033,.024),(s*.588,-.009,.876,.045,.030),
                (s*.582,-.008,.912,.047,.032),(s*.550,-.007,.944,.041,.030),
                (s*.540,-.009,.953,.034,.028)],3,[hand]*5)
        for j in range(4):
            z=.843+j*.024;size=[1,1.02,.95,.83][j]
            # Handle center (.566,-.053): inner pads touch its 25 mm radius.
            pts=[(s*.604,-.013,z),(s*.609,-.038,z-.001),
                 (s*.594,-.077,z-.003),(s*.563,-.091,z-.005),
                 (s*.539,-.075,z-.007),(s*.535,-.058,z-.008)]
            finger(b,pts,[v*size for v in [.014,.016,.015,.0135,.011,.008]],3,
                   [hand,hand,{hand:.35,fingers:.65},fingers,fingers,fingers])
        # Opposed thumb crosses the index at the front instead of hiding inside palm.
        finger(b,[(s*.534,-.026,.892),(s*.520,-.047,.867),(s*.528,-.076,.838),
                  (s*.552,-.091,.826),(s*.574,-.090,.826)],
               [.025,.025,.021,.018,.011],3,[hand,hand,{hand:.35,thumb:.65},thumb,thumb])
    b.plate([(s*.550,.025,.932),(s*.576,.028,.920),(s*.584,.024,.891),
             (s*.558,.023,.884),(s*.540,.026,.908)],-.004,4,hand)
    return b

sf['make_arm']=make_arm
scene=bpy.data.scenes['Starfire_Stage_A'];bpy.context.window.scene=scene
bpy.app.driver_namespace['sf_review']['reset']()
rig=bpy.data.objects['SF_Rig'];mat=bpy.data.materials['SF_Atlas']
for side,s in [('L',1),('R',-1)]:
    old=bpy.data.objects['SF_Arm_'+side]
    assert old.get('starfire_stage_a')
    bpy.data.objects.remove(old,do_unlink=True)
    obj=make_arm(side,s).finish(scene,mat,rig)
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(obj.data);bm.free()
print('B02 anatomical hands installed on existing world rig; shared builder ready for FP export')
