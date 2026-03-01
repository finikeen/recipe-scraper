/**
 * One-off migration: enrich all existing recipes with v2 AI-generated fields:
 *   keywords, servingSuggestions, dietaryVariants, enrichedSteps
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrateEnrichRecipes2.js
 *
 * Idempotent: recipes that already have a `keywords` field are skipped.
 * Requires Ollama running locally with the glm-5:cloud model pulled.
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore'
import { enrichRecipe } from '../server/enricher.js'

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

    // Idempotency: skip if keywords already exist
    if (data.keywords) {
      console.log(`Skip: "${name}"`)
      skipped++
      continue
    }

    try {
      const result = await enrichRecipe(data)

      const recipeRef = doc(db, 'recipes', recipeDoc.id)
      const batch     = writeBatch(db)

      batch.update(recipeRef, {
        keywords:           result.keywords           ?? [],
        servingSuggestions: result.servingSuggestions ?? [],
        dietaryVariants:    result.dietaryVariants    ?? {},
        enrichedSteps:      result.enrichedSteps      ?? [],
      })

      await batch.commit()

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

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
