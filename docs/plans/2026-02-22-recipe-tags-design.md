# AI Recipe Enrichment Migration (Tags + Ingredient Re-parsing)

**Date:** 2026-02-22
**Status:** Implemented

## Goal

A one-time migration script that uses Claude AI to enrich all existing recipes with:

1. **Tags** — 3–8 descriptive strings stored as `tags: string[]` on the recipe document
2. **AI-parsed ingredients** — overwrite the `recipes/{id}/ingredients` subcollection with AI-parsed structured data

The live scrape flow (`server/index.js`, `server/scraper.js`) is **not changed** — this is migration-only.

---

## Firestore Schema Changes

**Recipe document** — new field:
```
tags: string[]   // e.g. ["cajun", "grilled", "quick"]
```

**`recipes/{id}/ingredients` subcollection** — same field schema, AI-generated:
```
{ quantity, quantity2, unit, unitId (null), item, original, order }
```

---

## Files Changed

| File | Change |
|---|---|
| `scripts/migrateEnrichRecipes.js` | New migration script |
| `package.json` | Added `@anthropic-ai/sdk` dependency |
| `.env.local` | Manual: add `ANTHROPIC_API_KEY=...` |
| `CLAUDE.md` | Documented new script + env var |

---

## Implementation Design

### Idempotency

Skip recipes that already have a `tags` field. Re-running the script is safe.

### Claude API Usage

- Model: `claude-haiku-4-5-20251001` (fast, cheap)
- System prompt: `"You are a recipe analyst. Return ONLY valid JSON, no markdown fences."`
- User message: recipe name, description, raw ingredients (newline-separated), directions
- Response shape: `{ "tags": string[], "ingredients": [{ quantity, quantity2, unit, item, original, order }] }`
- Tags guidance: 3–8 tags covering style/theme/dietary/technique (e.g. "vegan", "cajun", "grilled", "one-pot", "quick")
- `max_tokens: 1024`

### Firestore Write

Per recipe, a single `writeBatch`:
1. `batch.update(recipeRef, { tags: result.tags })`
2. Delete all existing ingredient docs in the subcollection
3. `batch.set(doc(ingCol), ing)` for each AI-parsed ingredient (with `unitId: null`)

### Rate Limiting

500ms delay between recipes to avoid API rate limits.

### Error Handling

Per-recipe try/catch — log error and continue without aborting the full migration.

### Logging

```
Skip: "Recipe Name"
Enriched: "Recipe Name" (N tags, M ingredients)
Failed: "Recipe Name" — <error message>

Done — X enriched, Y skipped, Z failed
```

---

## How to Run

```bash
# 1. Add to .env.local:
ANTHROPIC_API_KEY=sk-ant-...

# 2. Run migration:
node --env-file=.env.local scripts/migrateEnrichRecipes.js
```

---

## Verification

1. Firebase Console → Firestore → pick a recipe → confirm `tags: [...]` field exists
2. Open `ingredients` subcollection → confirm docs have `item`, `quantity`, `unit`, `original`, `order`, `unitId: null`
3. Re-run script — confirm all recipes report as skipped (idempotency check)
4. Run `npm test` — confirm all tests still pass (no source code changed)
