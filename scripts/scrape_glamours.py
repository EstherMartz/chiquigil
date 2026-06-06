"""
Eorzea Collection - Glamour Item Ranking Scraper
Scrapes the top N pages of most-loved glamours and ranks items by usage frequency.

!! HEADS UP (2026-06-06): ffxiv.eorzeacollection.com sits behind Cloudflare's
   JS challenge. This plain-httpx version returns HTTP 403 for every request, so
   it CANNOT fetch live data on its own. It is kept for reference — the parsing
   logic (selectors, ranking tally, output shape) is correct and matches the
   working browser-based method.

   To actually refresh the data, use a real browser that solves the Cloudflare
   challenge, then run an in-page same-origin fetch loop. See
   docs/scraping-glamours.md for the exact, tested approach.
"""

import time
import json
import logging
from datetime import datetime
from collections import defaultdict

import httpx
from bs4 import BeautifulSoup

# -- Config ---------------------------------------------------------------------
BASE_URL    = "https://ffxiv.eorzeacollection.com"
PAGES       = 10          # pages to scrape (36 glamours each = 360 total)
DELAY       = 1.0         # seconds between requests -- be polite
OUTPUT_FILE = "public/data/snapshots/glamours.json"
HEADERS     = {
    "User-Agent": "MyFFXIVTradingApp/1.0 (contact@yourapp.com)",
    "Accept-Language": "en-US,en;q=0.9",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


# -- Scrapers -------------------------------------------------------------------

def get_glamour_list(page: int) -> list[dict]:
    """Fetch one page of the all-time most-loved glamours list."""
    url = f"{BASE_URL}/glamours/loved"
    params = {
        "filter[orderBy]":    "loves",
        "filter[datePeriod]": "any",
        "page":               page,
    }
    r = httpx.get(url, params=params, headers=HEADERS, timeout=15, follow_redirects=True)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    glamours = []
    for art in soup.select("article.c-glamour-grid-item"):
        link = art.select_one("a.c-glamour-grid-item-link")
        if not link:
            continue
        href      = link["href"]
        id_match  = href.split("/")
        title_el  = art.select_one(".c-glamour-grid-item-content-title")
        loves_el  = art.select_one(".c-glamour-grid-item-icons-counter")
        glamours.append({
            "id":    id_match[2] if len(id_match) > 2 else None,
            "title": title_el.get_text(strip=True) if title_el else None,
            "loves": int(loves_el.get_text(strip=True)) if loves_el else 0,
            "url":   BASE_URL + href,
        })
    return glamours


def get_glamour_items(glamour: dict) -> list[str]:
    """
    Fetch a glamour detail page and return a list of item names.
    Handles two page layouts used by Eorzea Collection:
      Layout A (older): .gear-icon-box-slot-name-wrapper + .list-item-title
      Layout B (newer): .c-gear-slot-item-name
    """
    r = httpx.get(glamour["url"], headers=HEADERS, timeout=15, follow_redirects=True)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    items = []

    # Layout A
    for wrapper in soup.select(".gear-icon-box-slot-name-wrapper"):
        parent = wrapper.parent
        item_el = parent.select_one(".list-item-title") if parent else None
        if item_el and item_el.get_text(strip=True):
            items.append(item_el.get_text(strip=True))

    # Layout B fallback
    if not items:
        for el in soup.select(".c-gear-slot-item-name"):
            name = el.get_text(strip=True)
            if name:
                items.append(name)

    return items


# -- Main -----------------------------------------------------------------------

def run_scrape() -> list[dict]:
    item_counts  = defaultdict(int)
    total_errors = 0

    for page in range(1, PAGES + 1):
        log.info(f"[Page {page}/{PAGES}] Fetching glamour list...")
        try:
            glamours = get_glamour_list(page)
            log.info(f"  -> {len(glamours)} glamours found")
        except Exception as e:
            log.error(f"  x Failed to fetch list page {page}: {e}")
            time.sleep(DELAY)
            continue

        time.sleep(DELAY)

        for i, glamour in enumerate(glamours, 1):
            try:
                items = get_glamour_items(glamour)
                for item in items:
                    item_counts[item] += 1
                log.info(f"  [{i:02}/{len(glamours)}] {glamour['title'][:40]:<40} -- {len(items)} items | {glamour['loves']} loves")
            except Exception as e:
                log.warning(f"  [{i:02}/{len(glamours)}] x {glamour['title']} -- {e}")
                total_errors += 1

            time.sleep(DELAY)

    log.info(f"\nDone. {len(item_counts)} unique items found. {total_errors} errors.")

    ranking = [
        {"item": item, "uses": count}
        for item, count in sorted(item_counts.items(), key=lambda x: x[1], reverse=True)
    ]
    return ranking


def save_output(ranking: list[dict]) -> None:
    output = {
        "generated_at":   datetime.utcnow().isoformat() + "Z",
        "pages_scraped":  PAGES,
        "glamours_checked": PAGES * 36,  # approx
        "unique_items":   len(ranking),
        "ranking":        ranking,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    log.info(f"Ranking saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    log.info(f"Starting scrape -- {PAGES} pages, ~{PAGES * 36} glamours")
    ranking = run_scrape()

    log.info("\n-- Top 20 Most Used Glamour Items --")
    for i, entry in enumerate(ranking[:20], 1):
        log.info(f"  {i:>2}. {entry['item']:<50} {entry['uses']} uses")

    save_output(ranking)
