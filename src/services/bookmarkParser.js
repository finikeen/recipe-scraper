/**
 * Parses a browser bookmark export HTML string.
 * Finds the "Recipes" folder and recursively extracts all URLs.
 *
 * Note: Browser bookmark HTML is non-standard. When parsed by DOMParser (or
 * jsdom), the structure is normalised so that each <DT> contains both the
 * folder heading (<H3>) and its child list (<DL>) rather than them being
 * siblings. This implementation accounts for that normalised structure.
 *
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

/**
 * Finds the <DL> element that represents the named folder.
 * After DOM normalisation, the structure is:
 *   <dt><h3>FolderName</h3><dl>...</dl></dt>
 * so we look for the DL as a descendant of the DT that contains the H3.
 */
function findFolderByName(root, name) {
  const headings = root.querySelectorAll('h3')
  for (const h3 of headings) {
    if (h3.textContent.trim() === name) {
      // The DL is a sibling of H3 inside the same DT
      const dt = h3.closest('dt') || h3.parentElement
      const dl = dt.querySelector('dl')
      if (dl) return dl
    }
  }
  return null
}

/**
 * Recursively extracts bookmark links from a <DL> element.
 * Each <DT> either contains an <A> (a bookmark) or an <H3> + nested <DL>
 * (a subfolder). After DOM normalisation both the H3 and its DL are children
 * of the same DT.
 */
function extractLinks(dl, folderPath) {
  const results = []

  for (const child of dl.children) {
    if (child.tagName.toUpperCase() !== 'DT') continue

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
      // After normalisation the subfolder DL is inside the same DT as the H3
      const subDl = child.querySelector(':scope > dl')
      if (subDl) {
        results.push(...extractLinks(subDl, `${folderPath}/${subfolderName}`))
      }
    }
  }

  return results
}
