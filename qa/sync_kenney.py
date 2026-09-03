#!/usr/bin/env python3
"""Sync curated Kenney CC0 GLB props from a local clone of shorepine/kenney.

Source: https://github.com/shorepine/kenney  (Kenney's CC0 game assets, 3d/ kits)
License: CC0 1.0 (public domain) — see game/attributes.md

Usage:
  git clone --depth 1 --filter=blob:none --sparse \
      https://github.com/shorepine/kenney.git /tmp/kenney
  cd /tmp/kenney && git sparse-checkout set 3d/furniture 3d/factory 3d/survival 3d/city-industrial
  python3 qa/sync_kenney.py /tmp/kenney

The curated list below is intentionally authored: we import the pieces that
serve the facility (furniture, industrial machinery, yard props), not the
entire 49-kit library. Every entry is used by game/data/props.json.
"""
import json
import shutil
import sys
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/kenney")
DST = Path(__file__).resolve().parent.parent / "game" / "models" / "kenney"

# kit -> [model basenames without .glb]
CURATED = {
    "furniture": [
        "bathroomCabinet", "bathroomCabinetDrawer", "bathroomMirror", "bathroomSink",
        "bathroomSinkSquare", "bathtub", "bedBunk", "bedDouble", "bedSingle",
        "bench", "benchCushion", "benchCushionLow", "bookcaseClosed",
        "bookcaseClosedDoors", "bookcaseClosedWide", "bookcaseOpen", "bookcaseOpenLow",
        "cabinetBed", "cabinetBedDrawer", "cabinetTelevision", "cabinetTelevisionDoors",
        "cardboardBoxClosed", "cardboardBoxOpen", "chair", "chairCushion", "chairDesk",
        "chairModernCushion", "chairModernFrameCushion", "chairRounded", "coatRackStanding",
        "computerKeyboard", "computerMouse", "computerScreen", "desk", "deskCorner",
        "kitchenBar", "kitchenBarEnd", "kitchenBlender", "kitchenCabinet",
        "kitchenCabinetDrawer", "kitchenCabinetUpper", "kitchenCabinetUpperDouble",
        "kitchenCoffeeMachine", "kitchenFridge", "kitchenFridgeLarge", "kitchenFridgeSmall",
        "kitchenMicrowave", "kitchenSink", "kitchenStove", "kitchenStoveElectric",
        "lampRoundFloor", "lampRoundTable", "lampSquareCeiling", "lampSquareFloor",
        "lampSquareTable", "lampWall", "laptop", "loungeChair", "loungeChairRelax",
        "loungeSofa", "loungeSofaCorner", "loungeSofaLong", "loungeDesignSofa",
        "pillow", "pillowBlue", "pillowLong", "plantSmall1", "plantSmall2", "plantSmall3",
        "pottedPlant", "radio", "rugDoormat", "rugRectangle", "rugRound", "rugRounded",
        "rugSquare", "sideTable", "sideTableDrawers", "speaker", "speakerSmall",
        "stoolBar", "stoolBarSquare", "table", "tableCloth", "tableCoffee",
        "tableCoffeeSquare", "tableCoffeeGlass", "tableCross", "tableRound", "tableGlass",
        "televisionModern", "televisionVintage", "toaster", "trashcan", "washer", "dryer",
        "shower", "toilet", "toiletSquare", "books",
    ],
    "factory": [
        "box-large", "box-small", "box-long", "box-wide", "catwalk-corner", "catwalk-cross",
        "catwalk-junction", "catwalk-stairs", "catwalk-straight", "cog-a", "cog-b", "cog-c",
        "cog-d", "cog-e", "cone", "crane", "crane-magnet", "hopper-high-round",
        "hopper-high-square", "hopper-round", "hopper-square", "lever-double", "lever-single",
        "machine", "machine-bed", "machine-fortified", "pipe-large", "pipe-large-bend",
        "pipe-large-curve", "pipe-large-junction", "pipe-large-long", "pipe-large-valve",
        "pipe-large-cross", "pipe-glass-large-valve", "piston-round", "piston-square",
        "screen-hanging-small", "screen-hanging-wide", "screen-small", "screen-wide",
        "warning-orange", "warning-traffic", "structure-short", "structure-medium",
    ],
    "survival": [
        "barrel", "barrel-open", "box", "box-large", "chest", "bucket", "metal-panel",
        "metal-panel-screws", "rock-a", "rock-b", "structure-metal-wall", "structure-metal-doorway",
        "structure-metal-floor", "structure-metal-roof", "workbench", "tool-hammer", "signpost",
    ],
    "city-industrial": [
        "detail-tank", "chimney-basic", "chimney-small", "chimney-medium", "chimney-large",
    ],
}

def main():
    manifest = []
    copied = 0
    for kit, names in CURATED.items():
        kit_src = SRC / "3d" / kit
        if not kit_src.exists():
            print(f"MISSING source kit {kit_src}", file=sys.stderr)
            continue
        kit_dst = DST / kit
        kit_dst.mkdir(parents=True, exist_ok=True)
        for name in names:
            src = kit_src / f"{name}.glb"
            if not src.exists():
                print(f"MISSING {src}", file=sys.stderr)
                continue
            shutil.copy2(src, kit_dst / f"{name}.glb")
            manifest.append({"kit": kit, "model": name, "bytes": src.stat().st_size})
            copied += 1
        # kit textures referenced by the GLBs ("Textures/colormap.png")
        tex = kit_src / "Textures"
        if tex.exists():
            shutil.copytree(tex, kit_dst / "Textures", dirs_exist_ok=True)
    out = Path(__file__).resolve().parent / "kenney_manifest.json"
    out.write_text(json.dumps(manifest, indent=2))
    print(f"copied {copied} models -> {DST}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
