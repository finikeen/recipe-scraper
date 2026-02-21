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
