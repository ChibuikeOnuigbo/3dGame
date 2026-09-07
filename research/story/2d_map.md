# 2D LEVEL PLAN — STILL WATER
Units: meters. North = -Z (top). Player spawns in kiosk at street level (y +4.0), station floor y 0.0, sump y -3.4.

```
            STREET (y+4)
   ┌─────────┐
   │  KIOSK  │  spawn; door slams+locks behind (commitment beat)
   │ (3×3)   │
   └───┬─────┘
       │ stair flight (ramp, -4m)
   ┌───┴────────────────┐
   │  ATRIUM / RECEPTION│  (8×6)  desk+logbook [O1], notice board,
   │  y 0               │  backlit sign "STORMWATER LIFT STN 6"
   └───┬────────────────┘
       │ door D1 (unlocked)
   ┌───┴──────────────┐      ┌──────────────┐
   │ CORRIDOR (12×2.6)├──────┤ BREAKER NOOK │ (2×2 alcove, W end)
   │                  │      │ breaker [O2] │
   └───┬──────────────┘      └──────────────┘
       │ door D2
   ┌───┴────────────────────────────┐
   │        PUMP HALL (14×11, h7)   │  HERO: two pump trains, gantry,
   │  y 0   hub — re-crossed twice  │  control panel [O3], red standby
   │                                 │  valve (locked), ceiling pipe runs
   └───┬──────────────┬──────────────┘
       │ door D3       │ stair down (barred while flooded)
   ┌───┴──────────┐    │
   │ VALVE GALLERY│    │  (10×6) shin-deep water, grating catwalk;
   │ (flooded)    │    │  intake valve A (close) + drain valve B (open)
   └───┬──────────┘    │  → water drains [O4] → east stair opens
       │ revealed stair│
   ┌───┴────────────────────────────┐
   │  SUMP / LOWER LEVEL (12×9)     │  y -3.4  THE NEST: bedroll, crate
   │                                │  desk, radio(static), calendar,
   │                                │  sealed gate + winch, last note [O5],
   └────────────┬───────────────────┘  master breaker [O6]
                │ crank winch [O7] → gate rises
   ┌────────────┴────┐
   │ LADDER SHAFT    │  +4m ladder → street grate
   │ EXIT (dawn)     │  ENDING card
   └─────────────────┘
```

## Routes
- Main: kiosk → atrium → corridor (+nook) → pump hall → valve gallery → (drain) → sump → shaft → street.
- Re-traversal: valve gallery → pump hall lights/HUD beat shows pumps running after breaker? (No — breaker stays on until O6.) Player returns through pump hall once (gallery→pump hall not required; gallery stair is inside gallery). Kept linear-with-hub: pump hall is crossed twice only if player backtracks for missed notes (optional).
- Dead ends: breaker nook (intentional, contains O2 + fuse crate detail); control mezzanine (vantage, optional note).
- No fake doors: 3 doors (D1 atrium–corridor, D2 corridor–pumphall, D3 pumphall–gallery) + kiosk door (locked behind, real but one-way) + service gate (opens at end). Every door maps to a real space.

## Landmarks / guidance
- Atrium: backlit station sign + corridor doorway lit.
- Corridor: painted arrow signage "PUMP HALL →", pipes lead east.
- Pump hall: enormous machines + hum; east door marked "VALVE GALLERY", south gate marked "SERVICE GATE" (barred, glowing when powered).
- Valve gallery: two valve wheels are the only colored (yellow/blue) objects; water sound.
- Sump: string light over the nest; red master-breaker cabinet; gate floodlit.
- Lighting gradient: warm atrium → neutral corridor → cold big hall → blue-grey wet gallery → amber nest.
