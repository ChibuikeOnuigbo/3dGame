# Environment reference — HDR / surroundings pass (2026-09-08)

SOURCE: user-supplied image-search reference list (Mirror's Edge, Mirror's
Edge Catalyst, Spider-Man PS4/MM/2, Dying Light 1/2, Watch Dogs 2/Legion,
Assassin's Creed family, Cyberpunk 2077, Ghostrunner, Titanfall 2, Half-Life
2/Alyx, Control, Uncharted 4/LL, TLOU2, GTA V, RDR2, Horizon FW, Batman AK,
Infamous SS, plus generic "realistic game environment" depth/detail queries).

Honesty note: the sandbox cannot open Google Images, and the directives
forbid claiming "visually inspected" without inspection. What follows is the
art direction those references are known for, applied procedurally — NOT a
copy of any copyrighted artwork, and not a claim of frame-level study.

OBSERVATION (direction implied by the reference set)
- Skylines in these games read through 3 depth bands: foreground rooflines,
  midground blocks, background towers dissolving into atmospheric haze.
- Rooflines are cluttered: HVAC units, water tanks, antenna masts, beacons —
  clean boxes read as fake.
- Night cities mix warm sodium windows with cool office-white windows.
- Streets get depth from distant context, never from black fog walls.
- "HDR fix" in-engine = tone-mapping + authored sky gradient + horizon haze,
  NOT an HDRI file (project rule: no Poly Haven HDRI dependency).

DECISION / IMPLEMENTATION STATUS
| Idea | Status |
|---|---|
| Far skyline band (10 towers, 45–65 m out, hazier tint) | DONE `_bounds()` world.js |
| Rooftop machinery silhouettes (HVAC/tank/mast+red beacon) | DONE |
| Warm+cool window mix on skyline | DONE |
| Existing near-band blocks + city-ground disc + sodium-haze dome | kept |
| ACES tone mapping + brightness setting | already present (main.js) |
| No colliders/lights on any silhouette (perf + integrity) | enforced |

Per the world-integrity directive, all additions are outside playable bounds,
non-collidable decoration; interior geometry/collision untouched by this pass.
