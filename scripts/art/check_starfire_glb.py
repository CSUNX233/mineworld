"""Focused stage-A GLB structure/skin/socket checks; no gameplay simulation."""
from pathlib import Path
import json
import struct
import math

ROOT=Path(__file__).resolve().parents[2]
DIRECTORY=ROOT/'public/assets/actors/starfire'


def parse(path):
    data=path.read_bytes()
    magic,version,length=struct.unpack_from('<III',data)
    assert magic==0x46546C67 and version==2 and length==len(data)
    size,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4E4F534A
    doc=json.loads(data[20:20+size])
    bsize,bkind=struct.unpack_from('<II',data,20+size)
    assert bkind==0x004E4942
    return doc,data[28+size:28+size+bsize],len(data)


def accessor(doc,binary,index):
    a=doc['accessors'][index]; v=doc['bufferViews'][a['bufferView']]
    format={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    size=struct.calcsize('<'+format*width)
    stride=v.get('byteStride',size)
    offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+format*width,binary,offset+i*stride) for i in range(a['count'])]


def main():
    results=[]
    for file in ['starfire-hero.glb','proxy-sword.glb','proxy-staff.glb']:
        doc,binary,size=parse(DIRECTORY/file)
        assert len(doc['scenes'])==1
        assert not doc.get('animations') and not doc.get('cameras')
        names=[n.get('name','') for n in doc['nodes']]
        assert not any(n in ['Cube','Camera','Light'] for n in names)
        assert len(doc['materials'])==1
        assert all('bufferView' in i and 'uri' not in i for i in doc['images'])
        assert all(s.get('magFilter')==9728 for s in doc.get('samplers',[]))
        tri=0; vertices=0
        for m in doc['meshes']:
            for p in m['primitives']:
                positions=accessor(doc,binary,p['attributes']['POSITION'])
                assert all(math.isfinite(c) for v in positions for c in v)
                indices=accessor(doc,binary,p['indices'])
                assert all(0<=i[0]<len(positions) for i in indices)
                tri+=len(indices)//3; vertices+=len(positions)
                if file=='starfire-hero.glb':
                    weights=accessor(doc,binary,p['attributes']['WEIGHTS_0'])
                    assert all(abs(sum(w)-1)<1e-5 for w in weights)
                    joints=accessor(doc,binary,p['attributes']['JOINTS_0'])
                    assert all(all(j<len(doc['skins'][0]['joints']) for j in v) for v in joints)
        if file=='starfire-hero.glb':
            assert len(doc['meshes'])==4 and len(doc['skins'])==1
            assert len(doc['skins'][0]['joints'])==30
            for socket in ['SF_Grip_R','SF_Skill_L','SF_AttackAxis_R']: assert socket in names
            expected={'SF_Grip_R':'hand.R','SF_Skill_L':'hand.L','SF_AttackAxis_R':'hand.R'}
            for socket,bone in expected.items():
                child=names.index(socket); parent=next(i for i,n in enumerate(doc['nodes']) if child in n.get('children',[]))
                assert names[parent]==bone,(socket,names[parent])
            source_report=json.loads((ROOT/'art/sunlit-actors/starfire-hero/stage-a-checks.json').read_text(encoding='utf-8'))
            assert tri==source_report['totalBodyTriangles']
        else:
            assert len(doc['meshes'])==1
            marker='SF_StaffMuzzle' if file=='proxy-staff.glb' else 'SF_BladeTip'
            assert any(n.startswith(marker) for n in names)
        results.append({'file':file,'bytes':size,'meshes':len(doc['meshes']),'triangles':tri,
                        'exportedVerticesAfterUVAndNormalSplits':vertices,'materials':len(doc['materials']),
                        'embeddedTextures':len(doc['images']),'skinCount':len(doc.get('skins',[])),
                        'animations':len(doc.get('animations',[]))})
    result={'passed':True,'scope':'asset structure, finite geometry, normalized weights, bone/socket hierarchy, embedded nearest-filtered texture; not gameplay or GPU performance','files':results}
    (ROOT/'art/sunlit-actors/starfire-hero/glb-checks.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))


if __name__=='__main__': main()
