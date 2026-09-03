#!/usr/bin/env python3
import json, os, time, re
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

UA = {"User-Agent": "Mozilla/5.0 HollowCurrentBot"}
OUT = "/home/user/game/tex"
rows = []

def get(url):
    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    return r

search = "https://opengameart.org/art-search-advanced?keys=industrial+texture&field_art_type_tid%5B%5D=9&sort_by=count&sort_order=DESC"
try:
    soup = BeautifulSoup(get(search).text, "lxml")
    links = []
    for a in soup.select("a"):
        href = a.get("href") or ""
        if href.startswith("/content/") and href.count("/") == 2:
            links.append(urljoin(search, href))
    links = list(dict.fromkeys(links))[:12]
    print("search hits", len(links))
    for page in links:
        try:
            html = get(page).text
            soup = BeautifulSoup(html, "lxml")
            title = soup.find("h1")
            title = title.get_text(strip=True) if title else page
            author = ""
            ael = soup.select_one("a.username")
            if ael:
                author = ael.get_text(strip=True)
            lic = "see page"
            for t in soup.stripped_strings:
                if re.search(r"CC0|CC-BY", t):
                    lic = t
                    break
            files = []
            for link in soup.select("a"):
                href = link.get("href") or ""
                if any(href.lower().endswith(ext) for ext in (".zip", ".png", ".jpg", ".jpeg")):
                    files.append(urljoin(page, href))
            rec = {
                "NAME": title, "CREATOR": author, "SOURCE": "OpenGameArt",
                "URL": page, "LICENSE": lic,
                "ATTRIBUTION": f"{author} / OpenGameArt — {page}",
                "DATE": "2026-09-02", "FILES": files[:6],
            }
            rows.append(rec)
            print(title, "|", author, "|", lic, "|", len(files))
            for href in files[:1]:
                if href.lower().endswith((".png", ".jpg", ".jpeg")):
                    bn = "oga_" + os.path.basename(href.split("?")[0])[:70]
                    dest = os.path.join(OUT, bn)
                    try:
                        open(dest, "wb").write(get(href).content)
                        print("  saved", bn, os.path.getsize(dest))
                    except Exception as e:
                        print("  file fail", e)
            time.sleep(0.35)
        except Exception as e:
            print("page fail", page, e)
except Exception as e:
    print("search fail", e)

prev = []
p = "/home/user/game/qa_assets.json"
if os.path.exists(p):
    prev = json.load(open(p))
prev.extend(rows)
json.dump(prev, open(p, "w"), indent=2)
print("total records", len(prev))
