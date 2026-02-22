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

describe('parsedIngredients', () => {
  it('is present on extractJsonLd result with correct shape', () => {
    const result = extractJsonLd(JSON_LD_FIXTURE)
    expect(result.parsedIngredients).toHaveLength(3)
    // spot-check: "2 eggs"
    const eggs = result.parsedIngredients.find(i => i.original === '2 eggs')
    expect(eggs).toMatchObject({ quantity: 2, unit: null, item: 'eggs', order: 2 })
  })

  it('parses fractional quantities and units correctly', () => {
    const result = extractJsonLd(`
      <html><head><script type="application/ld+json">
      {"@type":"Recipe","name":"Test","recipeIngredient":["1 1/2 cups sugar"],"recipeInstructions":"Mix."}
      </script></head></html>
    `)
    const [ing] = result.parsedIngredients
    expect(ing.quantity).toBe(1.5)
    expect(ing.unit).toBe('cups')
    expect(ing.item).toBe('sugar')
    expect(ing.original).toBe('1 1/2 cups sugar')
    expect(ing.order).toBe(0)
  })

  it('is present on extractHtmlHeuristics result', () => {
    const result = extractHtmlHeuristics(HTML_HEURISTICS_FIXTURE)
    expect(result.parsedIngredients).toHaveLength(3)
    const flour = result.parsedIngredients.find(i => i.original === '2 cups flour')
    expect(flour).toMatchObject({ quantity: 2, unit: 'cups', item: 'flour', order: 0 })
  })
})
