# Repository report — first-person-shooter (LUMECraft)

- **Local clone:** `research/github/repos/first-person-shooter`
- **Stack:** LUME (3D HTML custom elements) + Solid.js reactivity + Meteor server (`src/server/entry.ts`); declarative FPS skeleton aiming at skinnable/moddable multiplayer.
- **License:** NO LICENSE FILE in clone — README calls it open source but terms are unspecified; do not copy code.

## Architecture (source tree)
- Declarative scene graph in HTML/LUME elements rather than imperative three.js scene code; Solid.js stores drive game state; Meteor powers realtime multiplayer sync.
- No physics engine in the tree — movement/collision is bespoke around the DOM-like scene model.

## Key patterns to steal
- Conceptually: **state-driven scene** (Solid stores as source of truth, 3D view as projection). Interesting for UI-heavy overlays but heavyweight for a walking simulator.

## Techniques NOT to copy
- Meteor backend + LUME element stack — no reason to add server/multiplayer infra to Still Water; exotic element-based rendering loses the debugging/QA hooks we have with plain three.js.

## Applicability to Still Water
None. Priority: none.
