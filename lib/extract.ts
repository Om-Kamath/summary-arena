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

interface CachedContent {
  content: string | null
  fetchedAt: number
}
const contentCache = new Map<string, CachedContent>()
const CONTENT_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Fetch an article URL and return its text content.
 * Returns null if the fetch fails or content is too short.
 */
export async function fetchArticleContent(url: string): Promise<string | null> {
  const cached = contentCache.get(url)
  if (cached && Date.now() - cached.fetchedAt < CONTENT_TTL_MS) return cached.content

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

    const content = text.length >= MIN_CONTENT_LENGTH ? text : null
    contentCache.set(url, { content, fetchedAt: Date.now() })
    return content
  } catch {
    contentCache.set(url, { content: null, fetchedAt: Date.now() })
    return null
  }
}

/** Decode HTML entities and strip tags from an HN `text` field. */
export function cleanHnText(text: string): string {
  const $ = cheerio.load(text)
  return clean($.text()).slice(0, MAX_CONTENT_LENGTH)
}

/** Last index of `.` `!` `?` that closes a sentence (before space, newline, or end). */
function lastSentenceClosingIndex(s: string): number {
  let best = -1
  const re = /[.!?](?=\s|$|["'\u201c\u201d\u2019]\s|["'\u201c\u201d\u2019]$)/g
  for (const m of s.matchAll(re)) {
    const i = m.index
    if (i === undefined) continue
    if (s[i] === '.' && i > 0 && /\d/.test(s[i - 1]) && /\d/.test(s[i + 1] ?? '')) continue
    best = i
  }
  return best
}

/**
 * At most `maxWords` words, cut back to the last full sentence that still fits.
 * If no boundary in the first `maxWords` words, tries fewer words; rare fallback
 * is the raw word cap (one very long sentence).
 */
export function truncateToMaxWordsEndingSentence(text: string, maxWords: number): string {
  const normalized = clean(text)
  const words = normalized.split(/\s+/).filter(w => w.length > 0)
  if (words.length <= maxWords) return normalized

  const minWords = 50

  for (let n = maxWords; n >= minWords; n--) {
    const chunk = words.slice(0, n).join(' ')
    let last = lastSentenceClosingIndex(chunk)
    if (last < 0) {
      for (const sep of ['. ', '! ', '? ', '.\n', '!\n', '?\n']) {
        let from = 0
        while (true) {
          const j = chunk.indexOf(sep, from)
          if (j === -1) break
          last = j
          from = j + sep.length
        }
      }
    }
    if (last >= 0) {
      const out = chunk.slice(0, last + 1).trim()
      const outWords = out.split(/\s+/).filter(w => w.length > 0).length
      if (out.length >= 60 && outWords >= 8) return out
    }
  }

  const tail = words.slice(0, maxWords).join(' ')
  const last = lastSentenceClosingIndex(tail)
  if (last >= 0) return tail.slice(0, last + 1).trim()
  return tail
}
