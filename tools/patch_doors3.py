import re

# ---- A) doors.js: frame centered on the DOORWAY GAP (not the hinge group) ----
d = open('/home/user/3dGame/game/src/world/doors.js').read()

a = '''    // static frame (jambs + header) — never rotates with the leaf, so the
    // hinges visibly attach to something solid instead of floating in air
    this.frame = new THREE.Group();
    this.frame.position.set(...position);
    this.frame.rotation.y = yaw;'''
b = '''    // static frame (jambs + header) — never rotates with the leaf, so the
    // hinges visibly attach to something solid instead of floating in air.
    // MATH: the hinge pivot sits at one EDGE of the doorway, so the frame
    // must be offset by width/2 along the closed-leaf direction to land on
    // the GAP CENTER. (Bug this fixes: frame at the hinge origin put one
    // jamb + header mid-doorway — the "pillar in the open door".)
    // closed-leaf unit direction in world = (cos(yaw)*openSign, 0, -sin(yaw)*openSign)
    this.frame = new THREE.Group();
    const leafDx = Math.cos(yaw) * openSign, leafDz = -Math.sin(yaw) * openSign;
    this.frame.position.set(position[0] + leafDx * (width / 2), position[1], position[2] + leafDz * (width / 2));
    this.frame.rotation.y = yaw;'''
assert a in d, "frame anchor missing"
d = d.replace(a, b)

# knuckles: sit at the hinge EDGE of the gap (frame-local -openSign side), not frame center
a = '''        const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), darkMetal);
        knuckle.position.set(-openSign * 0.028, hy, 0);
        this.frame.add(knuckle);'''
b = '''        const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), darkMetal);
        knuckle.position.set(-openSign * (width / 2 - 0.035), hy, 0); // hinge edge of the gap
        this.frame.add(knuckle);'''
assert a in d, "knuckle anchor missing"
d = d.replace(a, b)
open('/home/user/3dGame/game/src/world/doors.js', 'w').write(d)
print("frame centered on gap (hinge math applied)")

# ---- B) player.js: torch end-for-end orientation done correctly ----
p = open('/home/user/3dGame/game/src/player/player.js').read()

a = '''          // longest axis -> Z (beam axis)
          const axes = [["x", size.x], ["y", size.y], ["z", size.z]].sort((a, b) => b[1] - a[1]);
          const [longest, len] = axes[0];
          const inner = new THREE.Group();
          inner.add(model);
          if (longest === "y") inner.rotation.x = -Math.PI / 2; // +Y -> -Z
          else if (longest === "x") inner.rotation.y = Math.PI / 2; // +X -> -Z
          // if longest z: leave (flip handled below if needed)
          // find which end has the glass (lens) meshes -> that end faces forward
          const glassBoxes = new THREE.Box3();
          let hasGlass = false;
          model.traverse((o) => {
            if (o.isMesh && o.material && /glass/i.test(o.material.name || "")) {
              glassBoxes.expandByObject(o);
              hasGlass = true;
            }
          });
          if (hasGlass) {
            const gc = glassBoxes.getCenter(new THREE.Vector3());
            const proj = longest === "y" ? gc.y : longest === "x" ? gc.x : gc.z;
            if (proj < 0) inner.rotation.y += Math.PI; // glass at back -> flip
          }'''
b = '''          // longest axis = beam axis; the GLASS (mouth/lens) end must point
          // at camera -Z. Method (fixes the backwards torch): detect which
          // signed end of the longest axis carries the glass, then pick the
          // single axis rotation that maps THAT end to -Z. (The old code
          // tried to flip by spinning about the long axis — a roll, not a
          // reversal — leaving the mouth pointing backwards.)
          const axes = [["x", size.x], ["y", size.y], ["z", size.z]].sort((a, b) => b[1] - a[1]);
          const [longest, len] = axes[0];
          // glass end detection (raw model space)
          let headSign = 1; // assume positive end if no glass found
          const glassBoxes = new THREE.Box3();
          let hasGlass = false;
          model.traverse((o) => {
            if (o.isMesh && o.material && /glass/i.test(o.material.name || "")) {
              glassBoxes.expandByObject(o);
              hasGlass = true;
            }
          });
          if (hasGlass) {
            const gc = glassBoxes.getCenter(new THREE.Vector3());
            const proj = longest === "x" ? gc.x : longest === "y" ? gc.y : gc.z;
            headSign = proj >= 0 ? 1 : -1;
          }
          const inner = new THREE.Group();
          inner.add(model);
          if (longest === "y") inner.rotation.x = headSign > 0 ? -Math.PI / 2 : Math.PI / 2;
          else if (longest === "x") inner.rotation.y = headSign > 0 ? Math.PI / 2 : -Math.PI / 2;
          else inner.rotation.x = headSign > 0 ? Math.PI : 0; // +Z -> -Z needs a half turn'''
assert a in p, "torch orientation anchor missing"
p = p.replace(a, b)

# runtime verification: after mount, glass must sit FORWARD of the body in camera space
a = '''          this.torchReady = true;
        } catch (e) {
          console.warn("torch model setup failed, keeping procedural", e);
        }'''
b = '''          this.torchReady = true;
          // runtime self-check: glass (mouth) must be further FORWARD (-Z in
          // camera space) than the torch body; if not, flip end-for-end.
          const glassMesh = (this._torchGlassMeshes || [])[0];
          if (glassMesh) {
            const verify = () => {
              try {
                const gw = glassMesh.getWorldPosition(new THREE.Vector3());
                const bw = this.vmLamp.getWorldPosition(new THREE.Vector3());
                const gl = this.camera.worldToLocal(gw.clone());
                const bl = this.camera.worldToLocal(bw.clone());
                if (gl.z > bl.z - 0.04) {
                  this.vmLamp.rotation.set(0.1, Math.PI - 0.12, 0.05); // end-for-end flip about camera up
                  this._torchFlipped = true;
                }
              } catch (e) { /* matrix not ready — retry next frame */ }
            };
            let tries = 0;
            const tick = () => { verify(); if (++tries < 90 && !this._torchFlipped) requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
          }
        } catch (e) {
          console.warn("torch model setup failed, keeping procedural", e);
        }'''
assert a in p, "torch verify anchor missing"
p = p.replace(a, b)

# track glass meshes for the verifier
a = '''          this._torchGlass = [];
          model.traverse((o) => {
            if (o.isMesh && o.material && /glass/i.test(o.material.name || "")) {
              o.material = o.material.clone();
              o.material.emissive = new THREE.Color(0xffe2b0);
              this._torchGlass.push(o.material);
            }
          });'''
b = '''          this._torchGlass = [];
          this._torchGlassMeshes = [];
          model.traverse((o) => {
            if (o.isMesh && o.material && /glass/i.test(o.material.name || "")) {
              o.material = o.material.clone();
              o.material.emissive = new THREE.Color(0xffe2b0);
              this._torchGlass.push(o.material);
              this._torchGlassMeshes.push(o);
            }
          });'''
assert a in p, "glass tracking anchor missing"
p = p.replace(a, b)
open('/home/user/3dGame/game/src/player/player.js', 'w').write(p)
print("torch orientation fixed (signed head detection + runtime verify)")
