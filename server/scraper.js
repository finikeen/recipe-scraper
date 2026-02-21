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
