#!/usr/bin/env python3
"""Download and package local anime artwork for WHO AM I? — Kalyon Edition."""
import difflib
import json
import re
import time
import zipfile
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "characters.json"
CHAR_DIR = ROOT / "assets" / "characters"
ANIME_DIR = ROOT / "assets" / "anime"
ZIP_FILE = ROOT / "assets" / "Kalyon-Anime-Pictures.zip"
API = "https://api.jikan.moe/v4"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "KalyonWhoAmI/1.0 (anime artwork catalog)"})

def norm(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())

def slug(value):
    result = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return result[:70] or "anime"

def get_json(url):
    for attempt in range(6):
        try:
            response = SESSION.get(url, timeout=30)
            if response.status_code == 429:
                time.sleep(2 + attempt * 2)
                continue
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            if attempt == 5:
                print("API request failed:", url, exc)
                return {}
            time.sleep(1.5 * (attempt + 1))
    return {}

def search(kind, query):
    data = get_json(f"{API}/{kind}?q={quote(query)}&limit=10")
    return data.get("data") or []

def best_character(name, franchise):
    results = search("characters", name)
    target = norm(name)
    exact = [item for item in results if norm(item.get("name")) == target]
    if exact:
        return exact[0]
    # Short or ambiguous names need the franchise in the search query.
    if len(target) <= 4 or not results:
        results = search("characters", f"{name} {franchise}")
    if not results:
        return None
    ranked = sorted(results, key=lambda item: difflib.SequenceMatcher(None, target, norm(item.get("name"))).ratio(), reverse=True)
    candidate = ranked[0]
    score = difflib.SequenceMatcher(None, target, norm(candidate.get("name"))).ratio()
    return candidate if score >= 0.78 else None

def best_anime(title):
    results = search("anime", title)
    if not results:
        return None
    target = norm(title)
    def score(item):
        names = [item.get("title"), item.get("title_english")]
        names += [entry.get("title") for entry in (item.get("titles") or [])]
        return max([difflib.SequenceMatcher(None, target, norm(name)).ratio() for name in names if name] or [0])
    ranked = sorted(results, key=score, reverse=True)
    return ranked[0] if score(ranked[0]) >= 0.58 else None

def image_url(item, anime=False):
    images = (item or {}).get("images") or {}
    jpg = images.get("jpg") or {}
    webp = images.get("webp") or {}
    if anime:
        return jpg.get("large_image_url") or jpg.get("image_url") or webp.get("large_image_url") or webp.get("image_url") or ""
    return jpg.get("image_url") or webp.get("image_url") or ""

def save_image(url, destination):
    if not url:
        return False
    try:
        response = SESSION.get(url, timeout=45)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "").lower()
        if not content_type.startswith("image/") or len(response.content) < 1000:
            return False
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(response.content)
        return True
    except Exception as exc:
        print("Image download failed:", url, exc)
        return False

def main():
    characters = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    franchises = {}
    manifest = []
    total = len(characters)
    for index, character in enumerate(characters, 1):
        cid = str(character.get("id") or f"character-{index}")
        name = character.get("name", "")
        franchise = character.get("franchise", "")
        portrait_path = CHAR_DIR / f"{slug(cid)}.jpg"
        poster_path = ANIME_DIR / f"{slug(franchise)}.jpg"

        if not portrait_path.exists():
            hit = best_character(name, franchise)
            url = image_url(hit)
            if save_image(url, portrait_path):
                print(f"[{index}/{total}] Saved portrait: {name}")
            else:
                print(f"[{index}/{total}] No reliable portrait: {name}")
            time.sleep(1.15)

        if franchise not in franchises:
            hit = best_anime(franchise)
            url = image_url(hit, anime=True)
            if save_image(url, poster_path):
                franchises[franchise] = f"./assets/anime/{poster_path.name}"
                print(f"  Saved anime poster: {franchise}")
            else:
                franchises[franchise] = ""
                print(f"  No poster found: {franchise}")
            time.sleep(1.15)

        character["image"] = f"./assets/characters/{portrait_path.name}" if portrait_path.exists() else ""
        character["franchiseImage"] = franchises.get(franchise, "")
        manifest.append({
            "id": cid, "name": name, "franchise": franchise,
            "portrait": character["image"], "poster": character["franchiseImage"],
            "source": "Jikan API / MyAnimeList image listing"
        })

    DATA_FILE.write_text(json.dumps(characters, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ZIP_FILE.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_FILE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for folder in (CHAR_DIR, ANIME_DIR):
            if folder.exists():
                for file in sorted(folder.glob("*")):
                    if file.is_file():
                        archive.write(file, file.relative_to(ROOT / "assets"))
        archive.writestr("artwork-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("README.txt", "WHO AM I? — KALYON EDITION\nAnime character portraits and series posters.\nImage listings retrieved using Jikan API (MyAnimeList data).\nSome characters may not have a reliably matched image.\n")
    portraits = sum(bool(item["portrait"]) for item in manifest)
    posters = len({item["franchise"] for item in manifest if item["poster"]})
    print(f"Artwork complete: {portraits}/{total} portraits, {posters}/{len(franchises)} anime posters.")
    print(f"ZIP created: {ZIP_FILE.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
