# Recipe Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal-use VueJS app that parses a browser bookmark export, scrapes recipe data from each URL, and saves confirmed recipes to Firestore.

**Architecture:** A Vue 3 (Vite) frontend communicates with a local Express scraper server via Vite's proxy. The Express server fetches recipe pages and parses them using JSON-LD first, HTML heuristics as fallback. Firestore holds two collections: `scrapeQueue` (checklist state) and `recipes` (saved recipes).

**Tech Stack:** Vue 3, Vite, Firebase Firestore, Express, cheerio, node-fetch, concurrently, Vitest

---

## File Structure

```
scraper/
├── _docs/
│   └── 2026-02-21-recipe-scraper-design.md
├── docs/
│   └── plans/
│       └── 2026-02-21-recipe-scraper.md
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── firebase.js
│   ├── components/
│   │   ├── ImportView.vue
│   │   ├── QueueView.vue
│   │   └── ReviewView.vue
│   └── services/
│       ├── bookmarkParser.js
│       ├── scrapeQueueService.js
│       └── recipesService.js
├── server/
│   ├── index.js
│   └── scraper.js
├── tests/
│   ├── bookmarkParser.test.js
│   └── scraper.test.js
├── vite.config.js
├── package.json
└── .env.local
```

---

## Task 1: Scaffold the Project

**Files:**
- Create: `package.json` (via Vite scaffold)
- Modify: `vite.config.js`
- Modify: `package.json` (scripts)

### Step 1: Scaffold Vue 3 project with Vite

Run in `scraper/`:
```bash
npm create vite@latest . -- --template vue
```
When prompted about existing files, select "Ignore files and continue".

Expected: Vue 3 project files created (`src/`, `index.html`, `vite.config.js`, etc.)

### Step 2: Install all dependencies

```bash
npm install firebase
npm install --save-dev vitest @vitest/ui jsdom
npm install express cheerio node-fetch
npm install --save-dev concurrently nodemon
```

### Step 3: Configure Vite proxy

Replace the contents of `vite.config.js`:
```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

### Step 4: Update package.json scripts

Open `package.json` and replace the `"scripts"` section with:
```json
"scripts": {
  "dev": "concurrently \"vite\" \"nodemon server/index.js\"",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Step 5: Commit

```bash
git init
git add .
git commit -m "feat: scaffold Vue 3 + Vite + Express project"
```

---

## Task 2: Firebase Setup

**Files:**
- Create: `.env.local`
- Create: `src/firebase.js`

### Step 1: Create a Firebase project (manual)

1. Go to https://console.firebase.google.com
2. Create a new project (e.g. "rezipees")
3. Add a Web app to the project
4. Copy the Firebase config object shown
5. In the Firebase console, go to **Firestore Database** → Create database → Start in **test mode**

### Step 2: Create `.env.local`

Create `scraper/.env.local` with your Firebase config values:
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Step 3: Create `src/firebase.js`

```js
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
```

### Step 4: Add `.env.local` to `.gitignore`

Open `.gitignore` and add:
```
.env.local
```

### Step 5: Commit

```bash
git add src/firebase.js .gitignore
git commit -m "feat: add Firebase Firestore setup"
```

---

## Task 3: Bookmark Parser (TDD)

Parses the browser HTML bookmark export file client-side. Finds the "Recipes" folder and all subfolders, returns a flat list of `{ url, title, folder }` objects.

**Files:**
- Create: `src/services/bookmarkParser.js`
- Create: `tests/bookmarkParser.test.js`

### Step 1: Write the failing tests

Create `tests/bookmarkParser.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { parseBookmarks } from '../src/services/bookmarkParser'

const FIXTURE_SIMPLE = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Other Stuff</H3>
  <DL><p>
    <DT><A HREF="https://other.com">Other</A>
  </DL><p>
  <DT><H3>Recipes</H3>
  <DL><p>
    <DT><A HREF="https://example.com/recipe1" ADD_DATE="1">Pasta Bake</A>
    <DT><A HREF="https://example.com/recipe2" ADD_DATE="2">Chicken Soup</A>
  </DL><p>
</DL><p>
`

const FIXTURE_NESTED = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Recipes</H3>
  <DL><p>
    <DT><A HREF="https://example.com/recipe1">Top Level Recipe</A>
    <DT><H3>Soups</H3>
    <DL><p>
      <DT><A HREF="https://example.com/soup1">Tomato Soup</A>
    </DL><p>
    <DT><H3>Desserts</H3>
    <DL><p>
      <DT><A HREF="https://example.com/cake1">Chocolate Cake</A>
      <DT><H3>Cookies</H3>
      <DL><p>
        <DT><A HREF="https://example.com/cookie1">Snickerdoodle</A>
      </DL><p>
    </DL><p>
  </DL><p>
</DL><p>
`

describe('parseBookmarks', () => {
  it('returns empty array when Recipes folder is not found', () => {
    const result = parseBookmarks('<DL><p><DT><A HREF="https://x.com">X</A></DL><p>')
    expect(result).toEqual([])
  })

  it('extracts URLs from Recipes folder', () => {
    const result = parseBookmarks(FIXTURE_SIMPLE)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ url: 'https://example.com/recipe1', title: 'Pasta Bake', folder: 'Recipes' })
    expect(result[1]).toEqual({ url: 'https://example.com/recipe2', title: 'Chicken Soup', folder: 'Recipes' })
  })

  it('ignores bookmarks outside the Recipes folder', () => {
    const result = parseBookmarks(FIXTURE_SIMPLE)
    const urls = result.map(r => r.url)
    expect(urls).not.toContain('https://other.com')
  })

  it('extracts URLs from nested subfolders with correct folder path', () => {
    const result = parseBookmarks(FIXTURE_NESTED)
    expect(result).toHaveLength(4)
    expect(result.find(r => r.url === 'https://example.com/recipe1').folder).toBe('Recipes')
    expect(result.find(r => r.url === 'https://example.com/soup1').folder).toBe('Recipes/Soups')
    expect(result.find(r => r.url === 'https://example.com/cake1').folder).toBe('Recipes/Desserts')
    expect(result.find(r => r.url === 'https://example.com/cookie1').folder).toBe('Recipes/Desserts/Cookies')
  })
})
```

### Step 2: Run tests to verify they fail

```bash
npm test -- tests/bookmarkParser.test.js
```
Expected: FAIL — `parseBookmarks` not found

### Step 3: Implement `src/services/bookmarkParser.js`

```js
/**
 * Parses a browser bookmark export HTML string.
 * Finds the "Recipes" folder and recursively extracts all URLs.
 * @param {string} html - Raw HTML content of the bookmark export file
 * @returns {{ url: string, title: string, folder: string }[]}
 */
export function parseBookmarks(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const recipesFolder = findFolderByName(doc, 'Recipes')
  if (!recipesFolder) return []

  return extractLinks(recipesFolder, 'Recipes')
}

function findFolderByName(root, name) {
  const headings = root.querySelectorAll('h3')
  for (const h3 of headings) {
    if (h3.textContent.trim() === name) {
      // The DL sibling immediately following the H3's parent DT
      const dt = h3.closest('dt') || h3.parentElement
      let sibling = dt.nextElementSibling
      while (sibling) {
        if (sibling.tagName === 'DL') return sibling
        sibling = sibling.nextElementSibling
      }
    }
  }
  return null
}

function extractLinks(dl, folderPath) {
  const results = []
  const children = dl.children

  for (const child of children) {
    if (child.tagName !== 'DT') continue

    const a = child.querySelector(':scope > a')
    const h3 = child.querySelector(':scope > h3')

    if (a) {
      results.push({
        url: a.getAttribute('href'),
        title: a.textContent.trim(),
        folder: folderPath,
      })
    } else if (h3) {
      const subfolderName = h3.textContent.trim()
      const subDl = child.nextElementSibling?.tagName === 'DL'
        ? child.nextElementSibling
        : null
      if (subDl) {
        results.push(...extractLinks(subDl, `${folderPath}/${subfolderName}`))
      }
    }
  }

  return results
}
```

### Step 4: Run tests to verify they pass

```bash
npm test -- tests/bookmarkParser.test.js
```
Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add src/services/bookmarkParser.js tests/bookmarkParser.test.js
git commit -m "feat: add bookmark parser with nested folder support"
```

---

## Task 4: Express Scraper — JSON-LD (TDD)

Implements the JSON-LD extraction strategy. Pure function — takes an HTML string, returns a recipe object or null.

**Files:**
- Create: `server/scraper.js`
- Create: `tests/scraper.test.js`

### Step 1: Write the failing test

Create `tests/scraper.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { extractJsonLd, extractHtmlHeuristics } from '../server/scraper.js'

const JSON_LD_FIXTURE = `
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Classic Carbonara",
    "description": "A rich Roman pasta dish.",
    "recipeIngredient": ["200g spaghetti", "100g pancetta", "2 eggs"],
    "recipeInstructions": [
      { "@type": "HowToStep", "text": "Boil pasta." },
      { "@type": "HowToStep", "text": "Fry pancetta." },
      { "@type": "HowToStep", "text": "Mix eggs and cheese." }
    ]
  }
  </script>
</head>
<body></body>
</html>
`

const JSON_LD_STRING_INSTRUCTIONS = `
<html>
<head>
  <script type="application/ld+json">
  {
    "@type": "Recipe",
    "name": "Simple Toast",
    "description": "Toast bread.",
    "recipeIngredient": ["1 slice bread"],
    "recipeInstructions": "Put bread in toaster. Wait."
  }
  </script>
</head>
</html>
`

const NO_RECIPE_FIXTURE = `
<html><head><script type="application/ld+json">{"@type": "WebPage"}</script></head></html>
`

describe('extractJsonLd', () => {
  it('returns null when no ld+json script is present', () => {
    expect(extractJsonLd('<html><body>nothing</body></html>')).toBeNull()
  })

  it('returns null when ld+json does not contain a Recipe type', () => {
    expect(extractJsonLd(NO_RECIPE_FIXTURE)).toBeNull()
  })

  it('extracts recipe from standard JSON-LD with HowToStep instructions', () => {
    const result = extractJsonLd(JSON_LD_FIXTURE)
    expect(result.name).toBe('Classic Carbonara')
    expect(result.description).toBe('A rich Roman pasta dish.')
    expect(result.ingredients).toEqual(['200g spaghetti', '100g pancetta', '2 eggs'])
    expect(result.directions).toEqual(['Boil pasta.', 'Fry pancetta.', 'Mix eggs and cheese.'])
  })

  it('handles string-format recipeInstructions', () => {
    const result = extractJsonLd(JSON_LD_STRING_INSTRUCTIONS)
    expect(result.directions).toEqual(['Put bread in toaster. Wait.'])
  })
})
```

### Step 2: Run test to verify it fails

```bash
npm test -- tests/scraper.test.js
```
Expected: FAIL — `extractJsonLd` not found

### Step 3: Create `server/scraper.js` with JSON-LD extraction

```js
import * as cheerio from 'cheerio'

/**
 * Attempts to extract recipe data from JSON-LD structured data.
 * @param {string} html
 * @returns {{ name, description, ingredients, directions } | null}
 */
export function extractJsonLd(html) {
  const $ = cheerio.load(html)
  let recipe = null

  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipe) return
    try {
      const data = JSON.parse($(el).html())
      const candidates = Array.isArray(data) ? data : [data]
      for (const item of candidates) {
        if (item['@type'] === 'Recipe') {
          recipe = item
          break
        }
      }
    } catch {
      // malformed JSON — skip
    }
  })

  if (!recipe) return null

  return {
    name: recipe.name || '',
    description: recipe.description || '',
    ingredients: normalizeIngredients(recipe.recipeIngredient),
    directions: normalizeInstructions(recipe.recipeInstructions),
  }
}

function normalizeIngredients(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  return [String(raw)]
}

function normalizeInstructions(raw) {
  if (!raw) return []
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) {
    return raw.map(step => {
      if (typeof step === 'string') return step
      return step.text || ''
    }).filter(Boolean)
  }
  return []
}
```

### Step 4: Run tests to verify they pass

```bash
npm test -- tests/scraper.test.js
```
Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add server/scraper.js tests/scraper.test.js
git commit -m "feat: add JSON-LD recipe extractor"
```

---

## Task 5: Express Scraper — HTML Heuristics (TDD)

Adds the fallback HTML parsing strategy to `server/scraper.js`.

**Files:**
- Modify: `server/scraper.js`
- Modify: `tests/scraper.test.js`

### Step 1: Add heuristics tests to `tests/scraper.test.js`

Append to the existing file:
```js
const HTML_HEURISTICS_FIXTURE = `
<html>
<body>
  <h1 class="recipe-title">Grandma's Cookies</h1>
  <p class="recipe-description">Old family favorite.</p>
  <ul class="ingredients">
    <li>2 cups flour</li>
    <li>1 cup sugar</li>
    <li>1 egg</li>
  </ul>
  <div class="instructions">
    <p>Mix dry ingredients.</p>
    <p>Add egg and mix.</p>
    <p>Bake at 350F for 12 minutes.</p>
  </div>
</body>
</html>
`

describe('extractHtmlHeuristics', () => {
  it('returns null when no recognizable recipe structure is found', () => {
    expect(extractHtmlHeuristics('<html><body><p>Hello world</p></body></html>')).toBeNull()
  })

  it('extracts recipe name, ingredients, and directions from common class patterns', () => {
    const result = extractHtmlHeuristics(HTML_HEURISTICS_FIXTURE)
    expect(result).not.toBeNull()
    expect(result.name).toBe("Grandma's Cookies")
    expect(result.ingredients).toContain('2 cups flour')
    expect(result.directions).toContain('Mix dry ingredients.')
  })
})
```

### Step 2: Run tests to verify new tests fail

```bash
npm test -- tests/scraper.test.js
```
Expected: FAIL — `extractHtmlHeuristics` not found

### Step 3: Add `extractHtmlHeuristics` to `server/scraper.js`

Append to the existing file:
```js
/**
 * Attempts to extract recipe data using common HTML class/tag patterns.
 * Best-effort — may return incomplete data on unusual blog layouts.
 * @param {string} html
 * @returns {{ name, description, ingredients, directions } | null}
 */
export function extractHtmlHeuristics(html) {
  const $ = cheerio.load(html)

  const name = $(
    '.recipe-title, .recipe-name, h1.entry-title, h1.post-title, h1'
  ).first().text().trim()

  const description = $(
    '.recipe-description, .recipe-summary, .wprm-recipe-summary'
  ).first().text().trim()

  const ingredientEls = $(
    '.ingredients li, .recipe-ingredients li, .wprm-recipe-ingredient'
  )
  const ingredients = ingredientEls.map((_, el) => $(el).text().trim()).get().filter(Boolean)

  const directionEls = $(
    '.instructions p, .directions p, .recipe-instructions p, ' +
    '.wprm-recipe-instruction-text, .step'
  )
  const directions = directionEls.map((_, el) => $(el).text().trim()).get().filter(Boolean)

  // Require at minimum a name and either ingredients or directions
  if (!name || (ingredients.length === 0 && directions.length === 0)) return null

  return { name, description, ingredients, directions }
}
```

### Step 4: Run all scraper tests

```bash
npm test -- tests/scraper.test.js
```
Expected: PASS (6 tests)

### Step 5: Commit

```bash
git add server/scraper.js tests/scraper.test.js
git commit -m "feat: add HTML heuristics recipe extractor fallback"
```

---

## Task 6: Express Server Route

Wires up the scraper functions into a POST `/api/scrape` route.

**Files:**
- Create: `server/index.js`

### Step 1: Create `server/index.js`

```js
import express from 'express'
import fetch from 'node-fetch'
import { extractJsonLd, extractHtmlHeuristics } from './scraper.js'

const app = express()
app.use(express.json())

const TIMEOUT_MS = 30_000

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: 'url is required' })
  }

  let html
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeScraper/1.0)' },
    })
    clearTimeout(timer)

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        failureReason: `${response.status} ${response.statusText}`,
      })
    }

    html = await response.text()
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    return res.status(200).json({
      success: false,
      failureReason: isTimeout ? 'Timeout' : 'No recipe data found',
    })
  }

  const recipe = extractJsonLd(html) || extractHtmlHeuristics(html)

  if (!recipe) {
    return res.status(200).json({ success: false, failureReason: 'No recipe data found' })
  }

  return res.status(200).json({ success: true, recipe })
})

app.listen(3000, () => {
  console.log('Scraper server running on http://localhost:3000')
})
```

### Step 2: Verify server starts

```bash
node server/index.js
```
Expected: "Scraper server running on http://localhost:3000"

Stop with Ctrl+C.

### Step 3: Commit

```bash
git add server/index.js
git commit -m "feat: add Express scrape route"
```

---

## Task 7: Firestore Services

Two thin service modules wrapping Firestore calls. No tests — Firestore is an external service; verify manually during integration.

**Files:**
- Create: `src/services/scrapeQueueService.js`
- Create: `src/services/recipesService.js`

### Step 1: Create `src/services/scrapeQueueService.js`

```js
import { db } from '../firebase.js'
import {
  collection, addDoc, getDocs, updateDoc, doc, query, where
} from 'firebase/firestore'

const COL = 'scrapeQueue'

export async function getQueue() {
  const snap = await getDocs(collection(db, COL))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addToQueue(items) {
  const existing = await getQueue()
  const existingUrls = new Set(existing.map(e => e.url))

  const newItems = items.filter(item => !existingUrls.has(item.url))
  for (const item of newItems) {
    await addDoc(collection(db, COL), {
      url: item.url,
      title: item.title,
      folder: item.folder,
      status: 'pending',
      recipeId: null,
      failureReason: null,
    })
  }
  return newItems.length
}

export async function updateQueueItem(id, updates) {
  await updateDoc(doc(db, COL, id), updates)
}
```

### Step 2: Create `src/services/recipesService.js`

```js
import { db } from '../firebase.js'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

export async function saveRecipe(recipe, sourceUrl) {
  const ref = await addDoc(collection(db, 'recipes'), {
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    sourceUrl,
    createdAt: serverTimestamp(),
  })
  return ref.id
}
```

### Step 3: Commit

```bash
git add src/services/scrapeQueueService.js src/services/recipesService.js
git commit -m "feat: add Firestore service modules"
```

---

## Task 8: App.vue — View Management

Top-level component managing which view is shown. No router — just a `currentView` ref and a `selectedRecipe` ref for passing scraped data to ReviewView.

**Files:**
- Modify: `src/App.vue`

### Step 1: Replace `src/App.vue`

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { getQueue } from './services/scrapeQueueService.js'
import ImportView from './components/ImportView.vue'
import QueueView from './components/QueueView.vue'
import ReviewView from './components/ReviewView.vue'

const currentView = ref('loading')
const pendingReview = ref(null) // { queueItem, recipe }

onMounted(async () => {
  const queue = await getQueue()
  currentView.value = queue.length === 0 ? 'import' : 'queue'
})

function onImportComplete() {
  currentView.value = 'queue'
}

function onReviewReady({ queueItem, recipe }) {
  pendingReview.value = { queueItem, recipe }
  currentView.value = 'review'
}

function onReviewDone() {
  pendingReview.value = null
  currentView.value = 'queue'
}
</script>

<template>
  <div id="app">
    <h1>Recipe Scraper</h1>
    <div v-if="currentView === 'loading'">Loading...</div>
    <ImportView v-else-if="currentView === 'import'" @complete="onImportComplete" />
    <QueueView v-else-if="currentView === 'queue'" @review-ready="onReviewReady" />
    <ReviewView
      v-else-if="currentView === 'review'"
      :queue-item="pendingReview.queueItem"
      :recipe="pendingReview.recipe"
      @done="onReviewDone"
    />
  </div>
</template>

<style>
body { font-family: sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
</style>
```

### Step 2: Commit

```bash
git add src/App.vue
git commit -m "feat: add App.vue view manager"
```

---

## Task 9: ImportView Component

Handles file upload, parses bookmarks, and writes to Firestore.

**Files:**
- Create: `src/components/ImportView.vue`

### Step 1: Create `src/components/ImportView.vue`

```vue
<script setup>
import { ref } from 'vue'
import { parseBookmarks } from '../services/bookmarkParser.js'
import { addToQueue } from '../services/scrapeQueueService.js'

const emit = defineEmits(['complete'])
const status = ref('')
const loading = ref(false)

async function onFileChange(event) {
  const file = event.target.files[0]
  if (!file) return

  loading.value = true
  status.value = 'Reading file...'

  const html = await file.text()
  const items = parseBookmarks(html)

  if (items.length === 0) {
    status.value = 'No recipes found. Make sure your bookmarks contain a "Recipes" folder.'
    loading.value = false
    return
  }

  status.value = `Found ${items.length} bookmarks. Saving to queue...`
  const added = await addToQueue(items)
  status.value = `Done! Added ${added} new URLs (${items.length - added} duplicates skipped).`

  setTimeout(() => emit('complete'), 1500)
}
</script>

<template>
  <div>
    <h2>Import Bookmarks</h2>
    <p>Upload your browser bookmark export file. The app will find all URLs in the "Recipes" folder.</p>
    <input type="file" accept=".html" :disabled="loading" @change="onFileChange" />
    <p v-if="status">{{ status }}</p>
  </div>
</template>
```

### Step 2: Commit

```bash
git add src/components/ImportView.vue
git commit -m "feat: add ImportView component"
```

---

## Task 10: QueueView Component

Shows the checklist, summary counts, and drives the scraping loop.

**Files:**
- Create: `src/components/QueueView.vue`

### Step 1: Create `src/components/QueueView.vue`

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { getQueue, updateQueueItem } from '../services/scrapeQueueService.js'

const emit = defineEmits(['review-ready'])

const queue = ref([])
const scraping = ref(false)

const pending = computed(() => queue.value.filter(i => i.status === 'pending'))
const saved = computed(() => queue.value.filter(i => i.status === 'saved'))
const failed = computed(() => queue.value.filter(i => i.status === 'failed'))

onMounted(async () => {
  queue.value = await getQueue()
})

async function scrapeUrl(item) {
  const res = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: item.url }),
  })
  return res.json()
}

async function processItem(item) {
  const result = await scrapeUrl(item)

  if (!result.success) {
    await updateQueueItem(item.id, { status: 'failed', failureReason: result.failureReason })
    item.status = 'failed'
    item.failureReason = result.failureReason
    return
  }

  await updateQueueItem(item.id, { status: 'scraped' })
  item.status = 'scraped'
  emit('review-ready', { queueItem: item, recipe: result.recipe })
}

async function startScraping() {
  scraping.value = true
  for (const item of pending.value) {
    if (!scraping.value) break
    await processItem(item)
    // Pause after emitting review — QueueView regains control when user finishes review
    // and navigates back. The loop resumes from the next pending item.
    if (item.status === 'scraped') break
    await new Promise(r => setTimeout(r, 1500)) // rate limit between failures
  }
  scraping.value = false
}

function stopScraping() {
  scraping.value = false
}
</script>

<template>
  <div>
    <h2>Scrape Queue</h2>

    <div class="summary">
      <span>Pending: {{ pending.length }}</span> |
      <span>Saved: {{ saved.length }}</span> |
      <span>Failed: {{ failed.length }}</span>
    </div>

    <div class="controls">
      <button v-if="!scraping && pending.length > 0" @click="startScraping">
        Start Scraping
      </button>
      <button v-if="scraping" @click="stopScraping">Stop</button>
      <span v-if="pending.length === 0">All done!</span>
    </div>

    <ul class="queue-list">
      <li v-for="item in queue" :key="item.id" :class="item.status">
        <span class="status-badge">{{ item.status }}</span>
        <span class="title">{{ item.title }}</span>
        <span class="folder">{{ item.folder }}</span>
        <span v-if="item.failureReason" class="failure-reason">{{ item.failureReason }}</span>
        <button
          v-if="item.status === 'pending' && !scraping"
          @click="processItem(item)"
        >Scrape</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.summary { margin: 1rem 0; font-weight: bold; }
.controls { margin-bottom: 1rem; }
.queue-list { list-style: none; padding: 0; }
.queue-list li { padding: 0.5rem; border-bottom: 1px solid #eee; display: flex; gap: 1rem; align-items: center; }
.status-badge { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: #ddd; }
li.saved .status-badge { background: #c8f7c5; }
li.failed .status-badge { background: #f7c5c5; }
li.scraped .status-badge { background: #c5d9f7; }
.title { flex: 1; }
.folder { color: #888; font-size: 0.85rem; }
.failure-reason { color: #c00; font-size: 0.8rem; }
</style>
```

### Step 2: Commit

```bash
git add src/components/QueueView.vue
git commit -m "feat: add QueueView component"
```

---

## Task 11: ReviewView Component

Displays scraped recipe data for confirm/reject.

**Files:**
- Create: `src/components/ReviewView.vue`

### Step 1: Create `src/components/ReviewView.vue`

```vue
<script setup>
import { ref } from 'vue'
import { saveRecipe } from '../services/recipesService.js'
import { updateQueueItem } from '../services/scrapeQueueService.js'

const props = defineProps({
  queueItem: Object,
  recipe: Object,
})
const emit = defineEmits(['done'])

const saving = ref(false)

async function onSave() {
  saving.value = true
  const recipeId = await saveRecipe(props.recipe, props.queueItem.url)
  await updateQueueItem(props.queueItem.id, { status: 'saved', recipeId })
  emit('done')
}

async function onReject() {
  await updateQueueItem(props.queueItem.id, {
    status: 'failed',
    failureReason: 'Rejected',
  })
  emit('done')
}
</script>

<template>
  <div>
    <h2>Review Recipe</h2>
    <p class="source">Source: <a :href="queueItem.url" target="_blank">{{ queueItem.url }}</a></p>

    <h3>{{ recipe.name }}</h3>
    <p>{{ recipe.description }}</p>

    <h4>Ingredients</h4>
    <ul>
      <li v-for="(ing, i) in recipe.ingredients" :key="i">{{ ing }}</li>
    </ul>

    <h4>Directions</h4>
    <ol>
      <li v-for="(step, i) in recipe.directions" :key="i">{{ step }}</li>
    </ol>

    <div class="actions">
      <button class="save" :disabled="saving" @click="onSave">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
      <button class="reject" :disabled="saving" @click="onReject">Reject</button>
    </div>
  </div>
</template>

<style scoped>
.source { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
.actions { margin-top: 2rem; display: flex; gap: 1rem; }
.save { background: #2d8a4e; color: white; padding: 0.5rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
.reject { background: #c0392b; color: white; padding: 0.5rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
```

### Step 2: Commit

```bash
git add src/components/ReviewView.vue
git commit -m "feat: add ReviewView component"
```

---

## Task 12: Smoke Test & Final Wiring

Verify everything works end-to-end with a real bookmark file.

### Step 1: Run the test suite one final time

```bash
npm test
```
Expected: All tests pass.

### Step 2: Start the app

```bash
npm run dev
```
Expected: Vue app on `http://localhost:5173`, Express on `http://localhost:3000`

### Step 3: Manual smoke test checklist

- [ ] Open `http://localhost:5173`
- [ ] Import View appears (queue is empty)
- [ ] Upload a browser bookmark export HTML file
- [ ] App shows "Found X bookmarks" and transitions to Queue View
- [ ] Queue shows all URLs with "pending" status and correct counts
- [ ] Click "Start Scraping" — first URL is scraped
- [ ] Review View appears with parsed recipe data
- [ ] Click "Save" — recipe saved to Firestore, returns to Queue
- [ ] Queue shows the item as "saved"
- [ ] Click "Start Scraping" again — continues with next pending item
- [ ] Reload the page — Queue View appears, state is preserved from Firestore
- [ ] Find a URL that will fail (dead link) — item shows as "failed" with reason

### Step 4: Final commit

```bash
git add .
git commit -m "feat: complete recipe scraper app"
```
