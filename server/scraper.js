import * as cheerio from 'cheerio'
import { parseIngredient } from 'parse-ingredient'

function parseIngredients(strings) {
  return strings.map((original, order) => {
    const [parsed = {}] = parseIngredient(original) ?? []
    return {
      quantity:  parsed.quantity  ?? null,
      quantity2: parsed.quantity2 ?? null,
      unit:      parsed.unitOfMeasure ?? null,
      unitId:    parsed.unitOfMeasureID ?? null,
      item:      parsed.description ?? original,
      original,
      order,
    }
  })
}

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

  const ingredients = normalizeIngredients(recipe.recipeIngredient)
  return {
    name: recipe.name || '',
    description: recipe.description || '',
    ingredients,
    directions: normalizeInstructions(recipe.recipeInstructions),
    parsedIngredients: parseIngredients(ingredients),
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

  return { name, description, ingredients, directions, parsedIngredients: parseIngredients(ingredients) }
}
