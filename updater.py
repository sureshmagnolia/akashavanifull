#!/usr/bin/env python3
"""
Akashvani Station Sync & Updater
Fetches official live radio station streams from Prasar Bharati / Akashvani
and updates stations.json while preserving TV and custom web radio entries.
"""

import json
import os
import re
import sys
import requests
from bs4 import BeautifulSoup

URL = "https://akashvani.gov.in/radio/live.php"
JSON_PATH = "stations.json"


def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '_', text)
    return text.strip('_')


def fetch_html():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    res = requests.get(URL, headers=headers, timeout=30)
    res.raise_for_status()
    return res.text


def extract_streams(html):
    pattern = r"var\s+channels\s*=\s*(\{[\s\S]*?\});"
    match = re.search(pattern, html)
    if not match:
        return {}

    channels_json = match.group(1)
    stream_urls = {}
    id_pattern = r"'(\d+)':\s*\{[^}]*?live_url:\s*'([^']+)'"

    for m in re.finditer(id_pattern, channels_json):
        channel_id = m.group(1)
        live_url = m.group(2)
        stream_urls[channel_id] = live_url

    return stream_urls


def main():
    print("[UPDATER] Fetching station data from akashvani.gov.in...")
    try:
        html = fetch_html()
        streams = extract_streams(html)
        print(f"[UPDATER] Extracted {len(streams)} live stream endpoints.")

        soup = BeautifulSoup(html, "html.parser")
        li_elements = soup.find_all("li", attrs={"data-channel": True})

        # Load existing custom TV & other stations
        existing_stations = []
        if os.path.exists(JSON_PATH):
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                existing_stations = json.load(f)

        custom_stations = [s for s in existing_stations if s.get("category") in ("tv", "others")]

        updated_air = []
        used_ids = set(s.get("id") for s in custom_stations)

        for li in li_elements:
            epg_id = li.get("data-channel", "")
            name_elem = li.select_one(".station-search .channel-name")
            state_elem = li.select_one(".station-search .channel-state")
            lang_elem = li.select_one(".station-search .channel-language")
            epg_button = li.select_one(".epg-button")

            name = name_elem.get_text(strip=True) if name_elem else ""
            if not name:
                continue

            state = state_elem.get_text(strip=True) if state_elem else "NATIONAL"
            lang = lang_elem.get_text(strip=True) if lang_elem else "Hindi"
            epg_url = epg_button.get("href", "").strip() if epg_button else ""

            stream_url = streams.get(epg_id, "")
            base_id = slugify(name) or f"air_{epg_id}"
            st_id = base_id
            counter = 1
            while st_id in used_ids:
                st_id = f"{base_id}_{counter}"
                counter += 1
            used_ids.add(st_id)

            updated_air.append({
                "id": st_id,
                "name": name,
                "category": "air",
                "state": state,
                "language": lang,
                "stream_url": stream_url,
                "epg_url": epg_url,
                "epg_id": epg_id
            })

        all_stations = updated_air + custom_stations
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(all_stations, f, indent=2, ensure_ascii=False)

        print(f"[UPDATER] Successfully synced {len(updated_air)} AIR stations + {len(custom_stations)} custom stations.")
    except Exception as e:
        print(f"[UPDATER ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
