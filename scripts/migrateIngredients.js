/**
 * One-off migration: parse ingredients for all existing recipes and write
 * them to the `recipes/{id}/ingredients` subcollection.
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrateIngredients.js
 *
 * Idempotent: recipes that already have an ingredients subcollection are skipped.
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  limit,
  query,
} from 'firebase/firestore'
import { parseIngredient } from 'parse-ingredient'

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

// ── Ingredient parser (mirrors server/scraper.js) ──────────────────────────

function parseIngredients(strings) {
  return strings.map((original, order) => {
    const [parsed] = parseIngredient(original) ?? [{}]
    return {
      quantity:  parsed.quantity  ?? null,
      quantity2: parsed.quantity2 ?? null,
      unit:      parsed.unitOfMeasure    ?? null,
      unitId:    parsed.unitOfMeasureID  ?? null,
      item:      parsed.description      ?? original,
      original,
      order,
    }
  })
}

// ── Migration ──────────────────────────────────────────────────────────────

async function migrate() {
  const recipesSnap = await getDocs(collection(db, 'recipes'))

  if (recipesSnap.empty) {
    console.log('No recipes found.')
    return
  }

  let migrated = 0
  let skipped  = 0

  for (const recipeDoc of recipesSnap.docs) {
    const { name, ingredients } = recipeDoc.data()

    if (!ingredients?.length) {
      console.log(`Skip (no ingredients): "${name}"`)
      skipped++
      continue
    }

    // Idempotency check — skip if subcollection already has docs
    const ingCol   = collection(db, 'recipes', recipeDoc.id, 'ingredients')
    const existing = await getDocs(query(ingCol, limit(1)))
    if (!existing.empty) {
      console.log(`Skip (already migrated): "${name}"`)
      skipped++
      continue
    }

    const parsed = parseIngredients(ingredients)
    const batch  = writeBatch(db)
    for (const ing of parsed) {
      batch.set(doc(ingCol), ing)
    }
    await batch.commit()

    console.log(`Migrated: "${name}" (${parsed.length} ingredients)`)
    migrated++
  }

  console.log(`\nDone — ${migrated} migrated, ${skipped} skipped.`)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
