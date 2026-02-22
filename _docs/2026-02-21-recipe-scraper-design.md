# Recipe Scraper App — Design Doc

**Date:** 2026-02-21
**Status:** Approved

## Overview

A personal-use VueJS app for scraping recipe data from bookmarked URLs and storing confirmed recipes in Firebase. The app parses a browser bookmark export file, queues all URLs found in the "Recipes" folder, scrapes each one, and presents the parsed data for review before saving.

This app is strictly for data gathering. Editing and recipe management are handled by a separate application.

---

## Architecture

Two local processes, one Firebase project:

```
Browser Export File (.html)
        │
        ▼
┌─────────────────────┐        ┌──────────────────────┐
│   Vue App (Vite)    │──────▶│  Express Scraper API  │
│   localhost:5173    │  /api  │  localhost:3000       │
└─────────────────────┘        └──────────┬───────────┘
        │                                  │ cheerio (fetch + parse)
        │                                  ▼
        │                         Recipe sites (web)
        │
        ▼
┌─────────────────────┐
│     Firestore       │
│  /recipes           │
│  /scrapeQueue       │
└─────────────────────┘
```

- Vite's built-in proxy forwards `/api/*` requests from the Vue app to Express — no CORS issues
- Both processes start with a single `npm run dev` via `concurrently`
- Express is a minimal local helper: one route, no auth, no database access

---

## Data Model (Firestore)

### `scrapeQueue` collection

One document per bookmarked URL. Persists the checklist across sessions.

```json
{
  "url": "string",
  "title": "string",
  "folder": "string",
  "status": "pending | scraped | saved | failed",
  "recipeId": "string | null",
  "failureReason": "string | null"
}
```

- `title` — bookmark label from the export file
- `folder` — subfolder path within the Recipes folder (e.g. `"Recipes/Soups"`)
- `status` — tracks progress across sessions
- `recipeId` — set when status is `saved`, references the `recipes` collection
- `failureReason` — simple error string when status is `failed` (e.g. `"404 Not Found"`, `"Timeout"`, `"No recipe data found"`)

### `recipes` collection

One document per confirmed recipe.

```json
{
  "name": "string",
  "description": "string",
  "ingredients": ["string"],
  "directions": ["string"],
  "sourceUrl": "string",
  "createdAt": "timestamp"
}
```

---

## UI / Component Flow

No routing library — three views managed via a `currentView` ref.

### 1. Import View

Shown only when `scrapeQueue` is empty (first run or after a reset).

- File picker to upload the browser export HTML
- Parses the file client-side, finds the "Recipes" folder and all subfolders, extracts all URLs
- Writes the full list to `scrapeQueue` in Firestore (skips duplicates if re-uploaded)
- Navigates automatically to the Queue view when done

### 2. Queue View

The main working view.

- Summary counts at the top: X pending / X saved / X failed
- List of all URLs with status indicators
- Failed items display their `failureReason`
- "Start Scraping" button — works through pending items one at a time
- Individual pending items can be clicked to scrape manually
- Returns here automatically after each Review

### 3. Review View

Shown after each successful scrape.

- Displays parsed recipe: name, description, ingredients, directions
- Source URL shown for reference
- **Save** — writes to `recipes` collection, marks `scrapeQueue` entry as `saved`, moves to next pending item
- **Reject** — marks `scrapeQueue` entry as `failed` (with reason `"Rejected"`), moves to next pending item
- Returns to Queue view when no pending items remain

---

## Scraping Strategy (Express)

**Route:** `POST /api/scrape` — accepts a URL, returns parsed recipe data or an error.

### Method 1: JSON-LD (structured data)

Tried first. Fast and clean when available.

- Finds `<script type="application/ld+json">` tags in the page
- Locates the object with `@type: "Recipe"`
- Maps standard schema.org fields: `name`, `description`, `recipeIngredient`, `recipeInstructions`
- Used by most mainstream sites (AllRecipes, Food Network, NYT Cooking, etc.)

### Method 2: HTML heuristics (fallback)

Used when JSON-LD is absent or yields no recipe.

- Uses `cheerio` to query the DOM
- Targets common CSS class/id patterns: `.recipe-name`, `.ingredients`, `.instructions`, heading tags, etc.
- Returns best-effort results — the review step catches incomplete parses

### Failure Cases

The scraper marks an item `failed` with a `failureReason` and moves on:

| Reason | Description |
|---|---|
| `"404 Not Found"` | Page does not exist |
| `"403 Forbidden"` | Site blocked the request |
| `"Timeout"` | No response within 30 seconds |
| `"No recipe data found"` | Both JSON-LD and HTML heuristics returned nothing |
| `"Rejected"` | User manually rejected the parsed result in Review view |

---

## Edge Cases

- **Duplicate import**: uploading the bookmark file again skips URLs already present in `scrapeQueue`
- **Session resume**: on app load, Queue view reads `scrapeQueue` from Firestore — work continues where it left off
- **Rate limiting**: 1–2 second delay between sequential scrapes to avoid hammering sites

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Composition API), Vite |
| Local scraper | Node.js, Express, cheerio, node-fetch |
| Database | Firebase Firestore |
| Dev tooling | concurrently (runs both servers with one command) |
