# Recipe Enrichment v2 — Step Metadata, Serving Suggestions, Dietary Variants, Keywords

**Date:** 2026-03-01
**Status:** Approved

## Goal

Enrich existing and future recipes with four new fields to improve UX, filtering, and recommendations in the Rezipees browsing app:

1. **keywords** — broader discovery terms for search/filtering
2. **servingSuggestions** — how and what to serve with the dish
3. **dietaryVariants** — achievable dietary swaps (vegan, gluten-free, etc.)
4. **enrichedSteps** — per-step metadata: time estimate, technique type, and criticality flag

This builds on the v1 migration (`migrateEnrichRecipes.js`) which added `tags` and AI-parsed ingredients.

---

## Firestore Schema

All new fields are additive on the `recipes/{id}` document. Existing fields are untouched.

```
keywords:           string[]
  // e.g. ["pasta", "Italian", "weeknight dinner", "comfort food"]

servingSuggestions: string[]
  // e.g. ["Serve with crusty bread", "Pairs well with a dry white wine"]

dietaryVariants:    { [label: string]: string[] }
  // e.g. { "vegan": ["Replace butter with coconut oil"],
  //         "gluten-free": ["Swap regular pasta for GF pasta"] }
  // keys only present when a genuine variant is achievable with simple swaps

enrichedSteps:      Array<{
  text:             string        // original step text, preserved exactly
  estimatedMinutes: number | null // null for non-timed steps
  techniqueType:    string | null // e.g. "boiling", "sautéing", "baking"
  isCritical:       boolean       // true = step has a common failure mode
  order:            number        // matches index in directions[]
}>
```

`directions[]` is kept unchanged — `enrichedSteps` is a parallel additive field.

---

## Architecture

### Shared enricher module: `server/enricher.js`

Exports a single `enrichRecipe(recipe)` async function:
- Calls local Ollama instance (`http://localhost:11434/api/generate`) with model `glm-5:cloud`
- System prompt: `"You are a recipe analyst. Return ONLY valid JSON, no markdown fences."`
- Uses `format: 'json'` to enforce JSON output, plus existing markdown fence stripping as fallback
- Returns `{ keywords, servingSuggestions, dietaryVariants, enrichedSteps }`
- Used by both the migration script and the live server
- No API key required — runs entirely local

### Migration script: `scripts/migrateEnrichRecipes2.js`

- Fetches all recipes from Firestore
- **Idempotency:** skip if `keywords` field already exists (distinct from v1's `tags` guard — both scripts safe to run on the same dataset)
- Calls `enrichRecipe()`, writes all 4 fields via `batch.update()`
- 500ms delay between recipes
- Same logging pattern as v1: Skip / Enriched / Failed summary
- Run with: `node --env-file=.env.local scripts/migrateEnrichRecipes2.js`

### Live scrape flow: `server/index.js`

After a successful scrape, call `enrichRecipe(recipe)` before responding:
- **Best-effort:** if enrichment fails or Ollama is not running, the scrape still succeeds — recipe is returned without enrichment fields
- Enriched fields merged into the recipe object in the response payload

### Save flow: `src/services/recipesService.js`

`saveRecipe()` spreads all recipe fields onto the Firestore document — no explicit changes needed since new fields are passed through generically. Verify this assumption during implementation.

### Ollama requirement

Ollama must be running locally with the `glm-5:cloud` model pulled:
```bash
ollama pull glm-5:cloud
ollama serve  # if not already running
```

No API key or environment variables needed — enrichment works entirely offline.

---

## Ollama Prompt

**System:** `"You are a recipe analyst. Return ONLY valid JSON, no markdown fences."`

**User:**
```
Recipe name: {name}

Description: {description}

Ingredients:
{ingredients joined by newline}

Directions:
{directions joined by newline}

Return a JSON object with:
- "keywords": 3–8 strings for search/discovery (ingredient types, cuisine, meal occasion, e.g. "pasta", "Italian", "weeknight dinner")
- "servingSuggestions": 1–3 strings for how/what to serve with this dish
- "dietaryVariants": object where keys are dietary labels (e.g. "vegan", "gluten-free") and values are string arrays of changes needed — only include variants that are genuinely achievable with simple swaps
- "enrichedSteps": array with one object per direction step, each with:
  - "text": the original step text (copy exactly)
  - "estimatedMinutes": number or null
  - "techniqueType": cooking technique string or null
  - "isCritical": true if this step has a common failure mode
  - "order": integer index starting at 0
```

---

## Files Changed

| File | Change |
|---|---|
| `server/enricher.js` | New — shared `enrichRecipe()` function using Ollama |
| `scripts/migrateEnrichRecipes2.js` | New — migration script for existing recipes |
| `server/index.js` | Call enricher after successful scrape (best-effort) |
| `src/services/recipesService.js` | Verify new fields pass through to Firestore |

---

## How to Run Migration

```bash
node --env-file=.env.local scripts/migrateEnrichRecipes2.js
```

---

## Verification

1. Firebase Console → pick a recipe → confirm `keywords`, `servingSuggestions`, `dietaryVariants`, `enrichedSteps` fields exist
2. Re-run migration — confirm all recipes skipped (idempotency)
3. Trigger a live scrape — confirm enriched fields appear in the saved recipe
4. Run `npm test` — confirm all tests pass (server logic has no unit tests yet; manual spot-check suffices)
