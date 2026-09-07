import re

w = open('/home/user/3dGame/game/src/world/world.js').read()
m = open('/home/user/3dGame/game/src/main.js').read()

# 1) hinge doors sit at their jamb edges (leaf covers the gap exactly)
a = """      id: "door_street", materials: m, position: [0, 3.2, -14.85], yaw: 0,"""
b = """      id: "door_street", materials: m, position: [-0.545, 3.2, -14.85], yaw: 0,"""
assert a in w, "door_street anchor missing"
w = w.replace(a, b)

a = '''    this._addDoor("door_d1", [0, 0, 0.35], 0, -1);
    this._addDoor("door_d2", [0, 0, 12.35], Math.PI, -1);
    this._addDoor("door_d3", [7.15, 0, 17.7], Math.PI / 2, 1);'''
b = '''    // hinge positions sit at the jamb edge of each doorway gap:
    // d1 gap x[-.55,.55] opens -x -> hinge east edge; d2 gap x[-.55,.55] with
    // yaw-pi opens +x in world -> hinge west edge; d3 gap z[17.15,18.25] with
    // yaw+pi/2 opens -z in world -> hinge north edge
    this._addDoor("door_d1", [0.545, 0, 0.35], 0, -1);
    this._addDoor("door_d2", [-0.545, 0, 12.35], Math.PI, -1);
    this._addDoor("door_d3", [7.15, 0, 18.205], Math.PI / 2, 1);'''
assert a in m, "addDoor anchor missing"
m = m.replace(a, b)

# 2) door colliders: leaf always solid, anti-crush guard while sweeping
a = '''    for (const { door, col } of this.doors.values()) {
      if (door.state === "opening" || door.state === "closing") {
        col.box.copy(door.colliderBox());
      }
      col.active = !(door.kind === "gate" && door.t > 0.75);
      if (door.kind === "hinge") col.active = door.t < 0.55;
      door.update(dt);
    }'''
b = '''    for (const { door, col } of this.doors.values()) {
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
assert a in w, "door collider anchor missing"
w = w.replace(a, b)

open('/home/user/3dGame/game/src/world/world.js', 'w').write(w)
open('/home/user/3dGame/game/src/main.js', 'w').write(m)
print("door fixes applied")
