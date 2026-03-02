/**
 * One-off migration: enrich all existing recipes with v2 AI-generated fields:
 *   keywords, servingSuggestions, dietaryVariants, enrichedSteps
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrateEnrichRecipes2.js
 *
 * Idempotent: recipes that already have a `keywords` field are skipped.
 * Requires Ollama running locally with the glm-5:cloud model pulled.
 * Requires serviceAccountKey.json in the project root.
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { enrichRecipe } from '../server/enricher.js'

// ── Firebase Admin init ────────────────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

// ── Migration ──────────────────────────────────────────────────────────────

async function migrate() {
  const recipesSnap = await db.collection('recipes').get()

  if (recipesSnap.empty) {
    console.log('No recipes found.')
    return
  }

  let enriched = 0
  let skipped  = 0
  let failed   = 0
  console.log(`Found ${recipesSnap.size} recipes. Starting migration...\n`)
  for (const recipeDoc of recipesSnap.docs) {
    const data = recipeDoc.data()
    const name = data.name ?? recipeDoc.id
    console.log(`Processing: "${name}"`)
    // Idempotency: skip if keywords already exist
    if (data.keywords) {
      console.log(`Skip: "${name}"`)
      skipped++
      continue
    }

    try {
      const result = await enrichRecipe(data)

      await db.collection('recipes').doc(recipeDoc.id).update({
        keywords:           result.keywords           ?? [],
        servingSuggestions: result.servingSuggestions ?? [],
        dietaryVariants:    result.dietaryVariants    ?? {},
        enrichedSteps:      result.enrichedSteps      ?? [],
      })

      console.log(
        `Enriched: "${name}" ` +
        `(${result.keywords?.length ?? 0} keywords, ` +
        `${result.enrichedSteps?.length ?? 0} steps)`
      )
      enriched++
    } catch (err) {
      console.error(`Failed: "${name}" — ${err.message}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone — ${enriched} enriched, ${skipped} skipped, ${failed} failed`)
}

console.log('\nStarting recipe enrichment migration...')
migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})