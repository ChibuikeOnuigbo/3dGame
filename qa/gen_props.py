#!/usr/bin/env python3
"""Generate game/data/props.json from the curated Kenney files.

Registry is the data-driven prop catalog: id -> {f, name, s, solid}.
`s` is a per-prop scale tuned to REAL-WORLD dimensions (the Kenney kits are
authored at roughly 0.4-0.5x meter scale, so furniture needs ~2x).

Flat single-color ("mono") GLBs are SKIPPED — they look like untextured
placeholder boxes and are removed from the game per art direction.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "game" / "models" / "kenney"
OUT = ROOT / "game" / "data" / "props.json"

# ---------------------------------------------------------------------------
# Kit defaults (fallback when a prop has no explicit entry in SCALE).
# ---------------------------------------------------------------------------
KIT_SCALE = {"furniture": 1.9, "factory": 1.4, "survival": 2.2, "city-industrial": 2.2}

# ---------------------------------------------------------------------------
# Per-prop scale, tuned to realistic sizes (meters).
# ---------------------------------------------------------------------------
SCALE = {
    # --- furniture (targets: desk 0.74h, chair 0.85h, fridge 1.8h, bed 2.0l) ---
    "desk": 2.0, "deskCorner": 2.0, "chairDesk": 2.0, "chairCushion": 1.6,
    "stoolBar": 1.7, "stoolBarSquare": 1.7,
    "loungeSofa": 2.0, "loungeSofaLong": 2.0, "loungeSofaCorner": 2.0,
    "loungeSofaOttoman": 1.7, "loungeChair": 2.0, "loungeChairRelax": 1.8,
    "loungeDesignChair": 1.7, "loungeDesignSofa": 2.0,
    "tableCloth": 2.2, "tableGlass": 2.2, "tableCoffeeGlass": 1.7,
    "tableCoffeeGlassSquare": 1.7, "tableCloth": 2.2,
    "sideTable": 1.7, "sideTableDrawers": 1.7,
    "benchCushion": 1.8, "benchCushionLow": 1.8,
    "bookcaseClosedDoors": 1.9, "bookcaseClosed": 1.9,
    "kitchenFridge": 2.0, "kitchenFridgeLarge": 2.0, "kitchenFridgeBuiltIn": 2.0,
    "kitchenFridgeSmall": 1.8, "kitchenStove": 1.9, "kitchenStoveElectric": 1.9,
    "kitchenSink": 1.8, "kitchenCabinet": 1.8, "kitchenCabinetDrawer": 1.8,
    "kitchenCabinetCornerInner": 1.8, "kitchenCabinetCornerRound": 1.8,
    "kitchenCabinetUpperDouble": 1.7, "kitchenBar": 1.8, "kitchenBarEnd": 1.8,
    "kitchenMicrowave": 1.8, "kitchenCoffeeMachine": 1.5, "toaster": 1.6,
    "bedSingle": 1.25, "bedDouble": 1.25, "bedBunk": 1.25,
    "bathtub": 1.8, "shower": 1.0, "toilet": 1.4, "toiletSquare": 1.4,
    "bathroomSink": 1.8, "bathroomSinkSquare": 1.8, "washer": 1.8, "dryer": 1.8,
    "bathroomMirror": 1.8,
    "cabinetBed": 1.6, "cabinetBedDrawer": 1.6, "cabinetBedDrawerTable": 1.6,
    "cabinetTelevisionDoors": 1.7,
    "plantSmall1": 2.0, "plantSmall2": 2.0, "plantSmall3": 2.0,
    "trashcan": 1.4, "lampRoundFloor": 1.2, "lampSquareFloor": 1.2,
    "lampRoundTable": 1.3, "lampSquareTable": 1.3, "lampWall": 1.2,
    "lampSquareCeiling": 1.2,
    "rugRectangle": 1.0, "rugRound": 1.0, "rugRounded": 1.0, "rugSquare": 1.0,
    "computerScreen": 1.6, "computerKeyboard": 1.6,
    "radio": 1.6,
    # --- factory (targets: machine ~1.9h, hopper ~2h, catwalk ~2h) ---
    "machine": 1.4, "machine-fortified": 1.4, "machine-bed": 1.4,
    "hopper-round": 1.4, "hopper-square": 1.4, "hopper-high-round": 1.4,
    "hopper-high-square": 1.4, "piston-round": 1.4, "piston-square": 1.4,
    "catwalk-straight": 1.6, "catwalk-corner": 1.6, "catwalk-stairs": 1.4,
    "catwalk-cross": 1.6, "catwalk-junction": 1.6,
    "pipe-large": 1.4, "pipe-large-long": 1.4, "pipe-large-bend": 1.4,
    "pipe-large-valve": 1.4, "pipe-glass-large-valve": 1.4,
    "cog-a": 1.3, "cog-b": 1.3, "cog-c": 1.3, "cog-d": 1.3, "cog-e": 1.3,
    "lever-single": 1.3, "lever-double": 1.3,
    "screen-wide": 1.2, "screen-hanging-small": 1.2, "screen-hanging-wide": 1.2,
    "warning-orange": 1.1, "warning-traffic": 1.1,
    "box-large": 1.8, "box-long": 1.8, "box-small": 1.6, "box-wide": 1.8,
    "cone": 1.8, "crane": 1.0, "crane-magnet": 1.2,
    "structure-short": 1.5, "structure-medium": 1.5,
    # --- survival (targets: barrel 0.85h, box 0.6h, rock 0.8h) ---
    "barrel": 2.6, "barrel-open": 2.6, "box": 2.4, "box-large": 2.4,
    "chest": 2.4, "metal-panel": 1.8, "metal-panel-screws": 1.8,
    "rock-a": 2.0, "rock-b": 2.0, "signpost": 1.5,
    "structure-metal-wall": 1.8, "structure-metal-doorway": 1.8,
    "workbench": 2.4, "tool-hammer": 2.0,
    # --- city-industrial ---
    "detail-tank": 2.6, "chimney-basic": 2.2, "chimney-large": 2.2,
    "chimney-medium": 2.2, "chimney-small": 2.2,
}

# ids that should block the player (furniture and heavy machinery)
SOLID = {
    # furniture
    "desk", "deskCorner", "tableCloth", "tableGlass", "tableCoffeeGlass",
    "tableCoffeeGlassSquare", "sideTable", "sideTableDrawers",
    "chairCushion", "chairDesk", "chairModernCushion", "chairModernFrameCushion",
    "stoolBar", "stoolBarSquare", "benchCushion", "benchCushionLow",
    "loungeChair", "loungeChairRelax", "loungeDesignChair",
    "loungeSofa", "loungeSofaCorner", "loungeSofaLong", "loungeSofaOttoman",
    "loungeDesignSofa",
    "bookcaseClosedDoors", "cabinetBed", "cabinetBedDrawer", "cabinetBedDrawerTable",
    "cabinetTelevisionDoors", "kitchenCabinet", "kitchenCabinetDrawer",
    "kitchenCabinetCornerInner", "kitchenCabinetCornerRound", "kitchenBar",
    "kitchenBarEnd", "kitchenFridge", "kitchenFridgeBuiltIn", "kitchenFridgeLarge",
    "kitchenFridgeSmall", "kitchenStove", "kitchenStoveElectric", "kitchenSink",
    "bathtub", "shower", "toilet", "toiletSquare", "bathroomSink",
    "bathroomSinkSquare", "washer", "dryer", "bedSingle", "bedDouble", "bedBunk",
    # factory
    "machine", "machine-bed", "machine-fortified", "hopper-round", "hopper-square",
    "hopper-high-round", "hopper-high-square", "piston-round", "piston-square",
    "catwalk-straight", "catwalk-corner", "catwalk-stairs",
    "box-large", "box-long", "box-small", "box-wide",
    "structure-short", "structure-medium",
    # survival
    "barrel", "barrel-open", "box", "box-large", "chest", "rock-a", "rock-b",
    "workbench", "structure-metal-wall", "structure-metal-doorway",
    # city-industrial
    "detail-tank",
}


def main():
    registry = {}
    for kit in sorted(p.name for p in MODELS.iterdir() if p.is_dir()):
        for glb in sorted((MODELS / kit).glob("*.glb")):
            model = glb.stem
            registry[model] = {
                "f": f"{kit}/{model}",
                "name": model,
                "s": SCALE.get(model, KIT_SCALE.get(kit, 1.0)),
                "solid": model in SOLID,
            }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(registry, indent=2) + "\n")
    print(f"wrote {OUT} with {len(registry)} props")


if __name__ == "__main__":
    main()
