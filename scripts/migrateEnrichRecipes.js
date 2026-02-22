/**
 * One-off migration: enrich all existing recipes with AI-generated tags
 * and AI-parsed ingredient data, replacing the parse-ingredient subcollection.
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrateEnrichRecipes.js
 *
 * Idempotent: recipes that already have a `tags` field are skipped.
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore'
import Anthropic from '@anthropic-ai/sdk'

// ── Firebase init ──────────────────────────────────────────────────────────

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

// ── Claude init ────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── AI enrichment ──────────────────────────────────────────────────────────

async function enrichRecipe(recipe) {
  const ingredientList = (recipe.ingredients ?? []).join('\n')
  const userMessage = `Recipe name: ${recipe.name}

Description: ${recipe.description ?? ''}

Ingredients:
${ingredientList}

Directions:
${(recipe.directions ?? []).join('\n')}

Return a JSON object with:
- "tags": 3–8 strings describing style, theme, dietary profile, or technique (e.g. "vegan", "cajun", "grilled", "one-pot", "quick")
- "ingredients": array of objects parsed from the ingredients list, each with:
  - "quantity": primary numeric quantity (number or null)
  - "quantity2": secondary quantity for ranges (number or null)
  - "unit": unit string e.g. "cup" (string or null)
  - "item": ingredient name (string)
  - "original": the original unparsed ingredient string (string)
  - "order": integer index starting at 0`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'You are a recipe analyst. Return ONLY valid JSON, no markdown fences.',
    messages: [{ role: 'user', content: userMessage }],
  })

  let text = message.content[0].text.trim()

  // Strip markdown code fences if present (try multiple strategies)
  if (text.startsWith('```')) {
    // Strategy 1: Match markdown fence pattern
    let match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (match) {
      text = match[1]
    } else {
      // Strategy 2: Find first ``` and last ``` and extract between them
      const firstFence = text.indexOf('```')
      const lastFence = text.lastIndexOf('```')
      if (firstFence !== lastFence) {
        text = text.substring(firstFence + 3, lastFence).trim()
        // Remove opening language specifier if present
        if (text.startsWith('json\n')) {
          text = text.substring(5)
        }
      }
    }
  }

  return JSON.parse(text)
}

// ── Migration ──────────────────────────────────────────────────────────────

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

    // Idempotency: skip if tags already exist
    if (data.tags) {
      console.log(`Skip: "${name}"`)
      skipped++
      continue
    }

    try {
      const result = await enrichRecipe(data)

      const recipeRef = doc(db, 'recipes', recipeDoc.id)
      const ingCol    = collection(db, 'recipes', recipeDoc.id, 'ingredients')

      // Delete existing ingredient docs
      const existingSnap = await getDocs(ingCol)
      const batch = writeBatch(db)

      for (const ingDoc of existingSnap.docs) {
        batch.delete(ingDoc.ref)
      }

      // Update recipe with tags
      batch.update(recipeRef, { tags: result.tags })

      // Write AI-parsed ingredients
      for (const ing of result.ingredients) {
        batch.set(doc(ingCol), {
          quantity:  ing.quantity  ?? null,
          quantity2: ing.quantity2 ?? null,
          unit:      ing.unit      ?? null,
          unitId:    null,
          item:      ing.item      ?? '',
          original:  ing.original  ?? '',
          order:     ing.order     ?? 0,
        })
      }

      await batch.commit()

      console.log(`Enriched: "${name}" (${result.tags.length} tags, ${result.ingredients.length} ingredients)`)
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
