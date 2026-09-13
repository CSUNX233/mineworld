# Stage B — in progress, awaiting hand/camera review

Stage A body was accepted. Stage B has not yet received final acceptance;
do not cross into Stage C without the user's approval.

## Current hand decision

The earlier procedural fingers were rejected. The current world and first-person
hands use DevMops' CC0 connected hand mesh and Rigify-authored finger poses.
Source and license: `art/sunlit-actors/starfire-hero/source/devmops-hands/SOURCE.md`.

The user accepted the weapon-free grasp screenshots `grasp-thumb-close-d/e/f.png`.
The selected closed grasp is e: four curled fingers left, thumb upper-right in the
inspection view. Keep this finger pose; change camera placement/grip fitting around it.

Latest requested camera adjustment: right hand rotated -90 degrees around Blender
world Z at its own wrist. Forearm reorientation was reverted after the user reported
twisting. Right camera arm has a rigid +0.18 m vertical translation at the clavicle;
hand orientation is independent. Latest game screenshot:
`art/sunlit-actors/starfire-hero/review/stage-b/game-right-hand-z-minus90.png`.

## Implemented, not final acceptance

- Separate first-person arm/hand asset; same animation state, phase and clip times.
- Immediate pose sampling when switching views; hidden world rig does not tick its mixer.
- Idle/walk/run, start/rise/apex/fall, light/heavy landing clips.
- Visual state is separated from physics; existing gravity, collision, move and jump values preserved.
- Foreground hands render in a separate final pass with internal depth testing.
- Old world and camera fallback geometry is released once the new model loads.
- Failed asynchronous asset loads retain the previous fallback.
- Authored combat remains Stage C; existing attack timer has a temporary presentation adapter.

Files: `starfire-stage-b.blend`, `starfire-first-person.blend` in the art directory;
`starfire-motion.glb`, `starfire-first-person.glb` in `public/assets/actors/starfire/`.
Current FP asset measured in Blender: 2 hand meshes, 1 material, 816 triangles, 60 bones.
The camera asset contains no forearm or long bracer geometry; wrist openings are capped.
Right FP hand retains the accepted placement and world-Z quarter turn.
Both FP clavicles now use authored Y=-0.10; left hand raised by Z=0.12 to bring
its visible palm nearer the right hand's height. Camera-space depth checked in game;
do not infer camera translation signs from the Blender axis alone.
Six adapted thumb vertices received a skin-space contact correction in each asset;
the original CC0 source is untouched. MCP evaluated FP mesh has no vertices inside
the 0.012-radius grip cylinder. This is a vertex check, not proof for every animation frame.
Actual game capture: `review/stage-b/game-hands-only-retracted.png`.
Weapon proportion pass: sword blade/guard width reduced 35%, upper length reduced
22%, exposed handle ends shortened, pommel reduced; staff head width reduced 28%
and lower shaft shortened 18% beyond the grip. Contact origin/radius preserved.
Exported both weapon GLBs and saved `starfire-weapons.blend`; inspected camera sword
and staff captures. These are presentation dimensions, not attack-distance changes.
Follow-up staff shortening: exposed upper/lower shaft spans reduced another 25%,
overall length 1.1134 -> 0.91865 Blender units (17.5% shorter). Grip region unchanged;
head translated rigidly with its muzzle marker. Verified MCP viewport and actual game
capture `review/stage-b/game-staff-shortened.png`; saved weapon blend and runtime GLB.
Second requested reduction: total length 0.91865 -> 0.73492 (exactly another 20%),
removed from exposed shaft spans while preserving the grip and rigid head shape.
Muzzle follows the head. Verified `game-staff-shortened-20.png` and MCP viewport;
updated GLB, editable weapon blend, and repeatable revision-guarded script.
This is an asset count, not a phone performance claim.

## Checks and outstanding work

- One existing Blender process (PID 17440) was verified; no Blender process launched or closed.
- MCP queries and viewport comparisons performed repeatedly; original unsaved Scene retained.
- Browser checks previously exercised all jump phases, immediate re-jump, movement during landing,
  and view switching without clock resets. Repeat against the final accepted hand asset.
- `node scripts/art/check_starfire_motion.mjs` passed: small steps, jump phases,
  light/heavy landing, immediate re-jump and dead-state freeze.
- TypeScript check passed after the latest runtime changes.
- Mobile landscape, final staff hold, failure fallback and lifecycle browser checks still need completion.
- `check_starfire_views.playwright.js` is prepared but not yet completed; its equipment getter
  must use `equipment.get('weapon')`, not `getWeapon()`.
- No Stage C claim, save migration, balance change, commit or push.

## Simplified skill presentation (user-requested scope change)

- User replaced the complex casting choreography requirement with palm energy for
  spell-related skills and a right-hand slash for blade-related skills.
- Successful `tryUseSkill` calls now trigger presentation after rejection/refund
  checks. Melee skills excluding defense use the right-hand slash (whirlwind,
  dash, seismic_slam, ember_blade); all others use left-palm energy, including guard.
- Reusable six-sprite/two-material bank uses cached combat textures, lasts 0.58s,
  and moves between world/camera sockets without restarting. Slash lasts 0.34s;
  it takes visual priority over ordinary attack overlays without stopping attacks.
- Recalibrated both inherited skill sockets to rigged hand-local palm center
  (0.001, 0.065, -0.045), measured from the actual loaded hand. Visual socket only;
  projectile origins, collision, ranges, damage, mana and cooldowns are unchanged.
- Death and floor reset clear the effects; disposing the actor releases its sprite
  materials while preserving shared combat textures. No per-frame particle creation.
- Browser check script exercises real successful fireball/whirlwind, rejected
  cooldown cast, view-switch timer/pose continuity, expiration and cleanup.
  Screenshots: skill-palm-fp/tp.png and skill-slash-fp-contact/followthrough.png.
  TP inspection uses an unobstructed camera boom so the model is visible.
- Blender MCP connection was refused during this pass; no Blender was launched.
  Socket correction is in runtime presentation and verified in actual game views.
  This does not claim completion of the earlier full Stage C/hit-reaction checklist.
