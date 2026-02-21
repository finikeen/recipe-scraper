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
