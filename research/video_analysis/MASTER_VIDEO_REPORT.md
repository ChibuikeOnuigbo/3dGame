# MASTER VIDEO REPORT
Collected 2026-09-04 from public watch-page metadata/descriptions/transcripts (video bytes and frames NOT downloadable from this sandbox — see research/videos/index.json `_meta`). Observations below are drawn from page evidence + well-known design facts about these titles; nothing below claims frame-level measurement we could not make.

## Source corpus (11 unique)
INFRA • SOMA • Amnesia: The Bunker • SCP: Containment Breach • Black Mesa • Portal 2 • Outlast 2 • Outlast (intro) • Alien: Isolation • Phasmophobia • Enari Engine devlog (iercan)

## VISUAL LANGUAGE
- One coherent material story per zone (INFRA: wet concrete + painted steel + rust; Sevastopol: beige plastics + CRT green + hazard stripes).
- Industrial signage is diegetic art AND wayfinding (Black Mesa sector signs, Sevastopol deck plates).
- Darkness is a resource, not a default. Outlast's night vision reads because most scenes are lit; INFRA is mostly daytime-lit decay.
- Era layering (Portal 2's old Aperture strata) communicates history with zero exposition.

## ENVIRONMENT DESIGN
- Facilities read as systems: power, water, air, transport. Rooms make sense as process chains (INFRA water treatment: intake → screens → settling → chlorination).
- Neglect is art direction: leaks, rust streaks under fittings, missing ceiling tiles, cable runs added decades after walls.
- Ceilings matter: pipes/conduits/rails make rooms feel engineered, not boxy.

## LEVEL DESIGN
- Hub-and-spoke beats sprawl for small scope (Amnesia: The Bunker's central admin hub; Phasmophobia's van+house).
- Test-chamber clarity (Portal 2): one idea per room, exit visible, entrance closes behind.
- Re-traversal with transformation (Black Mesa post-disaster) doubles a map's story value at zero extra square meters.
- Every doorway must be a real place (no fake doors) — maps stay small and honest.

## GAMEPLAY
- The genre's core verbs are non-violent: walk, look, read, flip breakers, turn valves, open doors, restore power, photograph evidence (INFRA/Phasmophobia).
- One tool, many uses: the camera (INFRA), the camcorder (Outlast), the scanner (SOMA) — each is aim + click with context-dependent meaning.
- Doors as tension units: Amnesia The Bunker and SCP:CB make open/close/lock a gameplay system.

## PLAYER GUIDANCE
- Light pulls, geometry funnels, sound beacons, signage, landmark silhouettes (INFRA's dam, the elevator frame in Bunker).
- Objectives phrased as world problems: "restore power to the gate", not "activate 3 switches".
- PA/announcer voice guides while unsettling (SCP:CB, Sevastopol).

## UI
- Diegetic where possible: hand labels, clipboards, terminal screens. Minimal HUD: objective line + interaction prompt + tool state.
- Prompt = verb + key, e.g. "[E] Open" — small, centered, contextual.

## ANIMATION
- Viewmodel bob/sway driven by player velocity, smoothed (Enari devlog 7:58).
- Doors: hinge rotation with ease; drawers: translation; valves: rotation with resistance feel. Machinery animates slowly and constantly (fans, pistons) to make spaces feel alive.

## AUDIO
- Room tone first; silence is a tool (Amnesia). Machinery hum defines zones (INFRA, Sevastopol).
- Contextual one-shots for every interaction; UI sounds soft and rare.
- PA/announcements: guidance + dread in one channel.

## ATMOSPHERE
- Restraint: not every room dark; contrast between safe (lit, warm, orderly) and unsafe (dark, cold, disordered) zones.
- Escalation via environment change, not monster count: water rising, lights failing, doors unlocking new zones.

## PACING
- 5-minute horror intro anatomy (Outlast): normality → travel → reveal of place → first wrongness → forced commitment.
- Alternate explore/discover/quiet/tension/resolve (all references).
- Chase intensity needs recovery valleys (Outlast 2's cited frustration).

## STORYTELLING
- Ordinary professional protagonist sent to a place for a mundane reason (INFRA's structural analyst; SOMA's scan patient; Ripley's courier job) — the job goes wrong.
- Story lives in documents, terminals, annotations, wear patterns — findable, optional, reconstructable.
- One strong idea, paid off at the end (SOMA's identity question, INFRA's corruption reveal).

## MISTAKES TO AVOID
- Constant maximal intensity (Outlast 2 nightmare chases).
- Mazes without landmarks (SCP:CB random rooms).
- Exposition dumps; un-skippable walk-and-talk.
- Empty rooms that exist only to add count.
- UI clutter covering the screen during tension.

## DESIGN PRINCIPLES (extracted, generalized)
1. ONE core interaction verb, reused with escalating meaning.
2. Rooms = process steps; the map is a machine the player re-activates.
3. Guide with light + landmarks + signage; never arrows.
4. Small honest map > large fake map. Hub-and-spoke for compact scope.
5. Safe/lit contrast zones make darkness meaningful.
6. Story is discovered, optional, and reconstructable from environment.
7. Protagonist is an ordinary worker; the job is the inciting incident.
8. Sound: room tone + contextual one-shots + rare stingers.
9. Performance discipline: small textures, dispose on unload, one rAF loop.
10. An ending that pays off the opening question (escape/exit + answer).
