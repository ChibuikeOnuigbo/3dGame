# CREDITS & LICENSES

## Code / technical reference (studied, adapted patterns only — no code copied)
| Source | License | Used for |
|---|---|---|
| [enari-engine](https://github.com/iErcann/enari-engine) (iercan) | MIT | module separation, loading-manager, FPS-camera patterns |
| [threejs-liminality](https://github.com/IronExcavater/threejs-liminality) | MIT | DoorController / power-switch / flashlight component patterns |
| [FPS2](https://github.com/Parking-Master/FPS2) | MIT | bot-AI / map-tool ideas (not yet used) |
| triomonnezza final-project | none stated | tween-based animation pattern (study only) |

## Assets
- Placeholder prop library: Kenney CC0 GLBs (`game/models/kenney/`) — CC0, retained
  only as a placeholder; scheduled for replacement by realistic assets per
  `research/VISUAL_TARGET.md`.
- Game art (models in `game/models/`): see `game/asset_manifest.md` and each
  model folder's `license.txt`.

## Video references (research only; no content redistributed)
INFRA (Tom Purcell), SOMA (jacksepticeye), Amnesia: The Bunker (Shirrako),
SCP: Containment Breach (Sesawer), Black Mesa (RabidRetrospectGames), Portal 2
(BadShoesGames), Outlast 2 (HGH), Outlast (Shadowy Mist), Alien: Isolation
(MKIceAndFire), Phasmophobia (SHN), enari devlog (iercan). Metadata recorded in
`research/video_manifest.json`; design principles only — no dialogue, story,
characters, or footage copied.

## Note on `.sketchfab_token`
A Sketchfab token file was present in the repository's first commit and has been
removed from tracking. If it is a live credential, rotate it — it exists in public
Git history. The project must use the `SKETCHFAB_ACCESS_TOKEN` environment variable
going forward (never committed).
