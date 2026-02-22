# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start both Vite (localhost:5173) and Express scraper (localhost:3000) via concurrently + nodemon
npm test             # Run Vitest once (all tests)
npm run test:watch   # Run Vitest in watch mode
npm test -- tests/bookmarkParser.test.js   # Run a single test file
npm run build        # Production build
```

## Architecture

This is a personal-use recipe scraper — a Vue 3 SPA backed by a local Express server, with Firebase Firestore as the database.

**Two-process model:** Vite dev server proxies `/api` requests to the Express server (`server/index.js`) running on port 3000. They must both be running (`npm run dev` starts both).

**Data flow:**
1. **Import** — User uploads a browser bookmark export (`.html`). `bookmarkParser.js` (client-side, uses `DOMParser`) finds the "Recipes" folder and extracts URLs. Items are written to Firestore `scrapeQueue` collection with `status: 'pending'`.
2. **Queue** — `QueueView.vue` shows the queue tabbed by status (pending/saved/failed). "Start Scraping" loops through pending items, POSTing each URL to `/api/scrape`. On success, recipe is auto-saved to Firestore; on failure, item is marked failed with a reason.
3. **Review** — When scraping a single item via the per-row "Scrape" button, a successful scrape navigates to `ReviewView.vue` for manual confirm/reject before saving.
4. **Save** — `recipesService.js` writes to Firestore `recipes` collection: `{ name, description, ingredients, directions, sourceUrl, createdAt }`.

**View management:** No Vue Router. `App.vue` uses a `currentView` ref (`'loading' | 'import' | 'queue' | 'review'`) and switches views based on queue state and emitted events.

**Server-side scraping** (`server/scraper.js`): Tries JSON-LD first (`extractJsonLd`), falls back to CSS class heuristics (`extractHtmlHeuristics`). The Express route always returns HTTP 200; `success: false` with a `failureReason` string signals scraping failures to the frontend.

## Key Files

| Path | Purpose |
|---|---|
| `src/firebase.js` | Firestore init, exports `db` |
| `src/services/scrapeQueueService.js` | `getQueue`, `addToQueue`, `updateQueueItem` |
| `src/services/recipesService.js` | `saveRecipe` |
| `src/services/bookmarkParser.js` | `parseBookmarks` — runs in browser, uses `DOMParser` |
| `server/scraper.js` | `extractJsonLd`, `extractHtmlHeuristics` — runs in Node, uses cheerio |
| `server/index.js` | `POST /api/scrape` route |
| `src/App.vue` | View manager |
| `tests/` | Vitest unit tests for `bookmarkParser` and `scraper` |

## Firebase / Firestore

Config is read from `.env.local` (`VITE_FIREBASE_*` variables). When creating a new Firestore database, Firebase defaults to production mode (deny all). For this personal tool, Firestore rules must be set to `allow read, write: if true` in Firebase Console → Firestore → Rules.

## jsdom / Bookmark Parsing Quirk

Browser bookmark HTML is non-standard. When parsed by `DOMParser` (or jsdom in tests), `<DL>` ends up **inside** the `<DT>`, not after it as a sibling. `bookmarkParser.js` uses `dt.querySelector('dl')` to find the child `<DL>`, not `dt.nextElementSibling`.

## Vue Conventions

- `<script setup>` syntax throughout (script → template → style order)
- Scoped styles with `<style scoped>` in components
- Plain JavaScript (no TypeScript)
- No Pinia or Vue Router — local `ref`/`computed` and prop/emit patterns only
