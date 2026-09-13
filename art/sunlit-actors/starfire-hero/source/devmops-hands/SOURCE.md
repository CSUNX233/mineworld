# DevMops hand source

- Author: DevMops
- Asset: Low Poly Arms (Rigged)
- Publication page: https://opengameart.org/content/low-poly-arms-rigged
- License stated by author: CC0 (https://creativecommons.org/publicdomain/zero/1.0/)
- Download: https://opengameart.org/sites/default/files/arms_low_poly_rigged.zip
- Retrieved: 2026-09-13
- Unmodified archive and extracted original `.blend`, `.fbx`, texture retained here.

MineWorld adaptation uses the connected hand mesh, original skin weights and
Rigify finger controls. The full source rig is retained in the editable project;
runtime assets contain the necessary finger deformation chains on the Starfire
skeleton. Colors/UVs are adapted to the Starfire atlas, with original Starfire
forearm armor. No author claim is made over the downloaded base model.

Scripts: `scripts/art/adapt_devmops_hands.py`,
`scripts/art/animate_starfire_hero.py`, `scripts/art/build_starfire_first_person.py`.

Approved source grasp: four finger master controls X=40 degrees, scale Y=0.60;
thumb master rotation=(0,0,0), scale Y=0.90. The source remains editable through
its original Rigify controls. Camera hand orientation is separate from this grasp.
