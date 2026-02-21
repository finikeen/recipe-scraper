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
