import * as cheerio from 'cheerio'

const MIN_CONTENT_LENGTH = 300
const MAX_CONTENT_LENGTH = 5000

/** Collapse whitespace and trim. */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Try to extract the main readable text from an HTML string. */
function extractFromHtml(html: string): string {
  const $ = cheerio.load(html)

  // Remove noise elements
  $('script, style, noscript, nav, header, footer, aside, .ad, .ads, #comments').remove()

  // Candidate selectors in priority order
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-body',
    '.post-content',
    '.entry-content',
    '.story-body',
    '#content',
    '#main',
  ]

  for (const sel of selectors) {
    const el = $(sel)
    if (el.length) {
      const text = clean(el.text())
      if (text.length >= MIN_CONTENT_LENGTH) {
        return text.slice(0, MAX_CONTENT_LENGTH)
      }
    }
  }

  // Fall back to full body text
  return clean($('body').text()).slice(0, MAX_CONTENT_LENGTH)
}

/**
 * Fetch an article URL and return its text content.
 * Returns null if the fetch fails or content is too short.
 */
export async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SummaryArena/1.0; +https://summary-arena.vercel.app)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return null

    const html = await res.text()
    const text = extractFromHtml(html)

    return text.length >= MIN_CONTENT_LENGTH ? text : null
  } catch {
    return null
  }
}

/** Decode HTML entities and strip tags from an HN `text` field. */
export function cleanHnText(text: string): string {
  const $ = cheerio.load(text)
  return clean($.text()).slice(0, MAX_CONTENT_LENGTH)
}
