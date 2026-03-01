/**
 * Shared recipe enricher — uses local Ollama to generate v2 enrichment fields.
 *
 * Exports:
 *   enrichRecipe(recipe) → { keywords, servingSuggestions, dietaryVariants, enrichedSteps }
 *
 * Requires Ollama running locally:
 *   ollama pull glm-5:cloud
 *   ollama serve
 */

const OLLAMA_URL   = 'http://localhost:11434/api/generate'
const OLLAMA_MODEL = 'glm-5:cloud'

function buildPrompt(recipe) {
  const ingredientList = (recipe.ingredients ?? []).join('\n')
  const directionList  = (recipe.directions  ?? []).join('\n')

  return `Recipe name: ${recipe.name ?? ''}

Description: ${recipe.description ?? ''}

Ingredients:
${ingredientList}

Directions:
${directionList}

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
}

function stripFences(text) {
  if (!text.startsWith('```')) return text

  // Strategy 1: Match exact markdown fence pattern
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (match) return match[1]

  // Strategy 2: Find first and last ``` and extract between
  const firstFence = text.indexOf('```')
  const lastFence  = text.lastIndexOf('```')
  if (firstFence !== lastFence) {
    let inner = text.substring(firstFence + 3, lastFence).trim()
    if (inner.startsWith('json\n')) inner = inner.substring(5)
    return inner
  }

  return text
}

export async function enrichRecipe(recipe) {
  const body = {
    model:  OLLAMA_MODEL,
    system: 'You are a recipe analyst. Return ONLY valid JSON, no markdown fences.',
    prompt: buildPrompt(recipe),
    format: 'json',
    stream: false,
  }

  const response = await fetch(OLLAMA_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const text = stripFences(data.response.trim())
  return JSON.parse(text)
}
