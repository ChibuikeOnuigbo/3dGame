import re

# ---- 1) world.js: fix stale anti-crush collider (the "invisible line" bug) ----
w = open('/home/user/3dGame/game/src/world/world.js').read()
a = '''    for (const { door, col } of this.doors.values()) {
      if (door.state === "opening" || door.state === "closing") {
        const nb = door.colliderBox();
        // anti-crush: hold the collider back if the sweeping leaf would
        // intersect the player capsule this frame
        const p = playerPos;
        const crush = p && nb.max.x > p.x - 0.42 && nb.min.x < p.x + 0.42 &&
          nb.max.z > p.z - 0.42 && nb.min.z < p.z + 0.42 &&
          nb.max.y > p.y + 0.2 && nb.min.y < p.y + 1.7;
        if (!crush) col.box.copy(nb);
      }
      if (door.kind === "gate") col.active = door.t < 0.75;
      else col.active = true; // leaf solid in every pose; open leaf rests by the wall
      door.update(dt);
    }'''
b = '''    for (const { door, col } of this.doors.values()) {
      const moving = door.state === "opening" || door.state === "closing";
      if (moving) {
        const nb = door.colliderBox();
        // anti-crush: if the sweeping leaf would intersect the player capsule,
        // disable collision for the sweep instead of holding a STALE box at
        // the closed pose (that stale box was the "invisible wall in the open
        // doorway" bug when a door was opened from the threshold)
        const p = playerPos;
        const crush = p && nb.max.x > p.x - 0.42 && nb.min.x < p.x + 0.42 &&
          nb.max.z > p.z - 0.42 && nb.min.z < p.z + 0.42 &&
          nb.max.y > p.y + 0.2 && nb.min.y < p.y + 1.7;
        if (crush) col.active = false;
        else { col.box.copy(nb); col.active = true; }
      } else if (door.kind === "gate") {
        col.active = door.t < 0.75;
      } else {
        col.active = true; // leaf solid in every pose; open leaf rests by the wall
      }
      door.update(dt);
      // settle: always resync the collider to the resting pose — guarantees
      // the doorway is physically clear the moment the door finishes moving
      if (moving && (door.state === "open" || door.state === "closed")) {
        col.box.copy(door.colliderBox());
        if (door.kind !== "gate") col.active = true;
      }
    }'''
assert a in w, "door collider block anchor missing"
w = w.replace(a, b)
open('/home/user/3dGame/game/src/world/world.js', 'w').write(w)
print("stale-collider fix applied")

# ---- 2) main.js: width param on _addDoor + two cloned doors ----
m = open('/home/user/3dGame/game/src/main.js').read()
a = '''  _addDoor(id, position, yaw, openSign) {
    const d = new Door({ id, materials: this.mats, position, yaw, width: 1.06, openSign });'''
b = '''  _addDoor(id, position, yaw, openSign, width = 1.06) {
    const d = new Door({ id, materials: this.mats, position, yaw, width, openSign });'''
assert a in m, "_addDoor signature anchor missing"
m = m.replace(a, b)

a = '''    this._addDoor("door_d3", [7.15, 0, 18.205], Math.PI / 2, 1);'''
b = '''    this._addDoor("door_d3", [7.15, 0, 18.205], Math.PI / 2, 1);
    // cloned doors — same jamb-hinge logic (gap edges from wall segments):
    // d4: breaker-nook doorway (west wall gap z 8.9..10.9), hinge north edge,
    //     opens into the corridor; d5: stairwell->atrium archway (south wall
    //     gap x -0.8..0.8), hinge west edge, opens into the atrium away from
    //     the approaching player
    this._addDoor("door_d4", [-1.45, 0, 10.855], Math.PI / 2, 1, 1.96);
    this._addDoor("door_d5", [-0.78, 0, -6.35], 0, 1, 1.56);'''
assert a in m, "door_d3 anchor missing"
m = m.replace(a, b)
open('/home/user/3dGame/game/src/main.js', 'w').write(m)
print("doors d4 (breaker nook) + d5 (atrium archway) added")
