# Recipe Enrichment v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich recipe documents with `keywords`, `servingSuggestions`, `dietaryVariants`, and `enrichedSteps` via Claude Haiku — both for existing recipes (migration script) and new recipes (live scrape flow).

**Architecture:** A shared `server/enricher.js` module is called by both a new migration script and the Express `/api/scrape` route. Enrichment is best-effort in the live flow — a failure never blocks saving. `saveRecipe()` is updated to spread the four new fields onto Firestore documents.

**Tech Stack:** Node.js ESM, `@anthropic-ai/sdk` (already installed), Firebase Firestore, Vitest for testing, Anthropic Claude Haiku model.

---

## Task 1: Create `server/enricher.js` with tests

**Files:**
- Create: `server/enricher.js`
- Create: `tests/enricher.test.js`

### Step 1: Write the failing tests

Create `tests/enricher.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseEnrichmentResponse } from '../server/enricher.js'

describe('parseEnrichmentResponse', () => {
  const validPayload = {
    keywords: ['pasta', 'Italian'],
    servingSuggestions: ['Serve hot'],
    dietaryVariants: { vegan: ['Replace egg with flax egg'] },
    enrichedSteps: [{ text: 'Boil water.', estimatedMinutes: 10, techniqueType: 'boiling', isCritical: false, order: 0 }],
  }
  const validJson = JSON.stringify(validPayload)

  it('parses plain JSON', () => {
    const result = parseEnrichmentResponse(validJson)
    expect(result.keywords).toEqual(['pasta', 'Italian'])
    expect(result.enrichedSteps[0].techniqueType).toBe('boiling')
  })

  it('strips ```json fences', () => {
    const result = parseEnrichmentResponse('```json\n' + validJson + '\n```')
    expect(result.keywords).toEqual(['pasta', 'Italian'])
  })

  it('strips plain ``` fences', () => {
    const result = parseEnrichmentResponse('```\n' + validJson + '\n```')
    expect(result.keywords).toEqual(['pasta', 'Italian'])
  })

  it('throws on invalid JSON', () => {
    expect(() => parseEnrichmentResponse('not json')).toThrow()
  })
})
```

### Step 2: Run tests to confirm they fail

```bash
npm test -- tests/enricher.test.js
```

Expected: FAIL — `parseEnrichmentResponse` not found.

### Step 3: Create `server/enricher.js`

```js
import Anthropic from '@anthropic-ai/sdk'

let _client = null

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export function parseEnrichmentResponse(text) {
  let t = text.trim()
  if (t.startsWith('```')) {
    const match = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (match) {
      t = match[1]
    } else {
      const firstFence = t.indexOf('```')
      const lastFence = t.lastIndexOf('```')
      if (firstFence !== lastFence) {
        t = t.substring(firstFence + 3, lastFence).trim()
        if (t.startsWith('json\n')) t = t.substring(5)
      }
    }
  }
  return JSON.parse(t)
}

export async function enrichRecipe(recipe) {
  const client = getClient()
  if (!client) return null

  const ingredientList = (recipe.ingredients ?? []).join('\n')
  const userMessage = `Recipe name: ${recipe.name}

Description: ${recipe.description ?? ''}

Ingredients:
${ingredientList}

Directions:
${(recipe.directions ?? []).join('\n')}

Return a JSON object with:
- "keywords": 3–8 strings for search/discovery (ingredient types, cuisine, meal occasion, e.g. "pasta", "Italian", "weeknight dinner")
- "servingSuggestions": 1–3 strings for how/what to serve with this dish
- "dietaryVariants": object where keys are dietary labels (e.g. "vegan", "gluten-free") and values are string arrays of changes needed — only include variants that are genuinely achievable with simple swaps
- "enrichedSteps": array with one object per direction step, each with:
  - "text": the original step text (copy exactly)
  - "estimatedMinutes": number or null
  - "techniqueType": cooking technique string or null
  - "isCritical": true if this step has a common failure mode
  - "order": integer index starting at 0`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: 'You are a recipe analyst. Return ONLY valid JSON, no markdown fences.',
    messages: [{ role: 'user', content: userMessage }],
  })

  return parseEnrichmentResponse(message.content[0].text)
}
```

### Step 4: Run tests to confirm they pass

```bash
npm test -- tests/enricher.test.js
```

Expected: 4 tests PASS.

### Step 5: Run full test suite to confirm nothing broke

```bash
npm test
```

Expected: all tests PASS.

### Step 6: Commit

```bash
git add server/enricher.js tests/enricher.test.js
git commit -m "feat: add enricher module with parseEnrichmentResponse and enrichRecipe"
```

---

## Task 2: Create the migration script

**Files:**
- Create: `scripts/migrateEnrichRecipes2.js`

No unit tests — this is a one-off script. Manual verification after running.

### Step 1: Create `scripts/migrateEnrichRecipes2.js`

```js
/**
 * One-off migration: enrich all existing recipes with AI-generated
 * keywords, serving suggestions, dietary variants, and step metadata.
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrateEnrichRecipes2.js
 *
 * Idempotent: recipes that already have a `keywords` field are skipped.
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { enrichRecipe } from '../server/enricher.js'

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db  = getFirestore(app)

async function migrate() {
  const recipesSnap = await getDocs(collection(db, 'recipes'))

  if (recipesSnap.empty) {
    console.log('No recipes found.')
    return
  }

  let enriched = 0
  let skipped  = 0
  let failed   = 0

  for (const recipeDoc of recipesSnap.docs) {
    const data = recipeDoc.data()
    const name = data.name ?? recipeDoc.id

    // Idempotency: skip if keywords already exist
    if (data.keywords) {
      console.log(`Skip: "${name}"`)
      skipped++
      continue
    }

    try {
      const result = await enrichRecipe(data)

      if (!result) {
        console.error(`Failed: "${name}" — ANTHROPIC_API_KEY not set`)
        failed++
        continue
      }

      const recipeRef = doc(db, 'recipes', recipeDoc.id)
      const batch = writeBatch(db)

      batch.update(recipeRef, {
        keywords:           result.keywords           ?? [],
        servingSuggestions: result.servingSuggestions ?? [],
        dietaryVariants:    result.dietaryVariants    ?? {},
        enrichedSteps:      result.enrichedSteps      ?? [],
      })

      await batch.commit()

      console.log(`Enriched: "${name}" (${result.keywords?.length ?? 0} keywords, ${result.enrichedSteps?.length ?? 0} steps)`)
      enriched++
    } catch (err) {
      console.error(`Failed: "${name}" — ${err.message}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone — ${enriched} enriched, ${skipped} skipped, ${failed} failed`)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

### Step 2: Commit

```bash
git add scripts/migrateEnrichRecipes2.js
git commit -m "feat: add migrateEnrichRecipes2 migration script"
```

---

## Task 3: Wire enricher into the live scrape flow

**Files:**
- Modify: `server/index.js`

### Step 1: Update `server/index.js`

Replace:
```js
import express from 'express'
import fetch from 'node-fetch'
import { extractJsonLd, extractHtmlHeuristics } from './scraper.js'
```

With:
```js
import express from 'express'
import fetch from 'node-fetch'
import { extractJsonLd, extractHtmlHeuristics } from './scraper.js'
import { enrichRecipe } from './enricher.js'
```

Replace the final success response (lines 44–50):
```js
const recipe = extractJsonLd(html) || extractHtmlHeuristics(html)

if (!recipe) {
  return res.status(200).json({ success: false, failureReason: 'No recipe data found' })
}

return res.status(200).json({ success: true, recipe })
```

With:
```js
const recipe = extractJsonLd(html) || extractHtmlHeuristics(html)

if (!recipe) {
  return res.status(200).json({ success: false, failureReason: 'No recipe data found' })
}

let enrichment = null
try {
  enrichment = await enrichRecipe(recipe)
} catch {
  // best-effort — scrape still succeeds without enrichment
}

const enrichedRecipe = enrichment ? { ...recipe, ...enrichment } : recipe
return res.status(200).json({ success: true, recipe: enrichedRecipe })
```

### Step 2: Commit

```bash
git add server/index.js
git commit -m "feat: enrich recipe in live scrape flow (best-effort)"
```

---

## Task 4: Update `saveRecipe` to persist the new fields

**Files:**
- Modify: `src/services/recipesService.js`

### Step 1: Update `saveRecipe`

Replace the `addDoc` call (lines 5–12):
```js
const ref = await addDoc(collection(db, 'recipes'), {
  name: recipe.name,
  description: recipe.description,
  ingredients: recipe.ingredients,
  directions: recipe.directions,
  sourceUrl,
  createdAt: serverTimestamp(),
})
```

With:
```js
const ref = await addDoc(collection(db, 'recipes'), {
  name: recipe.name,
  description: recipe.description,
  ingredients: recipe.ingredients,
  directions: recipe.directions,
  sourceUrl,
  createdAt: serverTimestamp(),
  ...(recipe.keywords           != null && { keywords:           recipe.keywords }),
  ...(recipe.servingSuggestions != null && { servingSuggestions: recipe.servingSuggestions }),
  ...(recipe.dietaryVariants    != null && { dietaryVariants:    recipe.dietaryVariants }),
  ...(recipe.enrichedSteps      != null && { enrichedSteps:      recipe.enrichedSteps }),
})
```

### Step 2: Run full test suite

```bash
npm test
```

Expected: all tests PASS (service has no direct unit tests but existing tests should still pass).

### Step 3: Commit

```bash
git add src/services/recipesService.js
git commit -m "feat: persist enrichment fields in saveRecipe"
```

---

## Task 5: Fix dev script so Express server loads `.env.local`

**Files:**
- Modify: `package.json`

The Express server needs `ANTHROPIC_API_KEY` at runtime. Currently `nodemon server/index.js` doesn't load `.env.local`.

### Step 1: Update the `dev` script in `package.json`

Replace:
```json
"dev": "concurrently \"vite\" \"nodemon server/index.js\"",
```

With:
```json
"dev": "concurrently \"vite\" \"nodemon --exec 'node --env-file=.env.local' server/index.js\"",
```

### Step 2: Update `CLAUDE.md` key files table to document the new script

In the Key Files table in `CLAUDE.md`, add:
```
| `scripts/migrateEnrichRecipes2.js` | AI enrichment v2: keywords, serving suggestions, dietary variants, step metadata. Run: `node --env-file=.env.local scripts/migrateEnrichRecipes2.js` |
| `server/enricher.js` | Shared `enrichRecipe()` function used by migration and live scrape flow |
```

### Step 3: Commit

```bash
git add package.json CLAUDE.md
git commit -m "chore: load .env.local in dev server and document enricher files"
```

---

## Verification

After all tasks are complete:

1. **Unit tests pass:** `npm test` — all green
2. **Migration works:** `node --env-file=.env.local scripts/migrateEnrichRecipes2.js`
   - Should show `Enriched: "..."` lines followed by `Done — N enriched, 0 skipped, 0 failed`
3. **Idempotency:** Re-run the migration — all recipes should report as `Skip`
4. **Live scrape:** Start dev server (`npm run dev`), scrape a URL from the queue, save it, check Firebase Console that the recipe document has `keywords`, `servingSuggestions`, `dietaryVariants`, `enrichedSteps`
5. **Graceful degradation:** Temporarily unset `ANTHROPIC_API_KEY`, scrape a URL — it should still save successfully without enrichment fields
