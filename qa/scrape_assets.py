#!/usr/bin/env python3
"""Scrape CC0/attribution metadata and downloadable texture/model URLs."""
import json, os, re, time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

OUT = "/home/user/game/assets"
TEX = "/home/user/game/tex"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TEX, exist_ok=True)
UA = {"User-Agent": "HollowCurrentAssetBot/1.0 (game development; attribution harvest)"}
rows = []

def get(url):
    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    return r

# --- Poly Haven textures (CC0) ---
ph = [
    ("concrete_floor_worn_001", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_worn_001/concrete_floor_worn_001_diff_1k.jpg"),
    ("concrete_wall_008", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_008/concrete_wall_008_diff_1k.jpg"),
    ("metal_plate", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate/metal_plate_diff_1k.jpg"),
    ("wood_floor_deck", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_diff_1k.jpg"),
    ("brown_mud_03", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud_03/brown_mud_03_diff_1k.jpg"),
    ("aerial_rocks_02", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_rocks_02/aerial_rocks_02_diff_1k.jpg"),
    ("rusty_metal_02", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rusty_metal_02/rusty_metal_02_diff_1k.jpg"),
    ("painted_plaster_wall", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_plaster_wall/painted_plaster_wall_diff_1k.jpg"),
    ("floor_tiles_06", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/floor_tiles_06/floor_tiles_06_diff_1k.jpg"),
    ("rock_wall_09", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_wall_09/rock_wall_09_diff_1k.jpg"),
    ("metal_walkway_01", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_walkway/metal_walkway_diff_1k.jpg"),
    ("asphalt_02", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg"),
    ("gravelly_sand", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/gravelly_sand/gravelly_sand_diff_1k.jpg"),
    ("roof_07", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_07/roof_07_diff_1k.jpg"),
    ("plastic_005", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/plastic_005/plastic_005_diff_1k.jpg"),
]
for name, url in ph:
    dest = os.path.join(TEX, os.path.basename(url))
    try:
        if not os.path.exists(dest) or os.path.getsize(dest) < 1000:
            data = get(url).content
            open(dest, "wb").write(data)
        rows.append({
            "NAME": name, "CREATOR": "Poly Haven contributors",
            "SOURCE": "Poly Haven", "URL": f"https://polyhaven.com/a/{name}",
            "LICENSE": "CC0", "ATTRIBUTION": "not required",
            "DATE": "2026-09-02", "FILE": dest, "USED IN": "materials",
        })
        print("PH ok", name)
    except Exception as e:
        print("PH fail", name, e)

# --- OpenGameArt search pages ---
oga_pages = [
    "https://opengameart.org/content/industrial-textures-pack",
    "https://opengameart.org/content/50-cc0-textures",
    "https://opengameart.org/content/free-tiling-textures-pack-41",
    "https://opengameart.org/content/metal-textures-pack",
    "https://opengameart.org/content/pbr-textures",
]
for page in oga_pages:
    try:
        html = get(page).text
        soup = BeautifulSoup(html, "lxml")
        title = soup.find("h1")
        title = title.get_text(strip=True) if title else page
        author = ""
        a = soup.select_one(".username, a.username, .submitted a")
        if a:
            author = a.get_text(strip=True)
        license_el = soup.find(string=re.compile(r"CC0|CC-BY|GPL", re.I))
        lic = license_el.strip() if license_el else "see page"
        # download links
        links = []
        for link in soup.select("a"):
            href = link.get("href") or ""
            if any(href.lower().endswith(ext) for ext in (".zip", ".png", ".jpg", ".jpeg")):
                links.append(urljoin(page, href))
        rows.append({
            "NAME": title, "CREATOR": author or "OpenGameArt user",
            "SOURCE": "OpenGameArt", "URL": page, "LICENSE": lic,
            "ATTRIBUTION": f"{author} — {page}" if author else page,
            "DATE": "2026-09-02", "DOWNLOADS": links[:8], "USED IN": "pending",
        })
        print("OGA", title, "by", author, "files", len(links))
        # grab first image if small
        for href in links[:2]:
            if href.lower().endswith((".png", ".jpg", ".jpeg")):
                bn = os.path.basename(href.split("?")[0])[:80]
                dest = os.path.join(TEX, bn)
                try:
                    open(dest, "wb").write(get(href).content)
                    print("  saved", bn)
                except Exception as e:
                    print("  skip", e)
        time.sleep(0.4)
    except Exception as e:
        print("OGA fail", page, e)

# --- Kenney landing ---
try:
    html = get("https://kenney.nl/assets").text
    soup = BeautifulSoup(html, "lxml")
    rows.append({
        "NAME": "Kenney Game Assets",
        "CREATOR": "Kenney",
        "SOURCE": "kenney.nl",
        "URL": "https://kenney.nl/assets",
        "LICENSE": "CC0",
        "ATTRIBUTION": "Kenney.nl (not required)",
        "DATE": "2026-09-02",
        "USED IN": "props if packs resolve",
    })
    print("Kenney page ok")
except Exception as e:
    print("Kenney fail", e)

# --- Sketchfab collection metadata (no binary download without login) ---
try:
    html = get("https://sketchfab.com/thomaslinxin/collections/survival-escape-horror-game-735670546cf3471fa83afc73bc83ccf6").text
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else "collection"
    rows.append({
        "NAME": title,
        "CREATOR": "thomaslinxin (collection curator)",
        "SOURCE": "Sketchfab",
        "URL": "https://sketchfab.com/thomaslinxin/collections/survival-escape-horror-game-735670546cf3471fa83afc73bc83ccf6",
        "LICENSE": "per-model (filtered downloadable CC licenses on listing)",
        "ATTRIBUTION": "See individual Sketchfab model pages; login required to fetch GLB",
        "DATE": "2026-09-02",
        "USED IN": "discovery only — binaries blocked without Sketchfab auth",
    })
    print("Sketchfab collection metadata ok")
except Exception as e:
    print("Sketchfab fail", e)

open("/home/user/game/qa_assets.json", "w").write(json.dumps(rows, indent=2))
print("WROTE", len(rows), "records")
