import Parser from 'rss-parser'
import { fetchArticleContent, cleanHnText } from './extract'

const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; SummaryArena/1.0; +https://summary-arena.vercel.app)',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
  timeout: 8_000,
})

export const FEEDS = [
  { name: 'Reuters Politics',   url: 'https://feeds.reuters.com/Reuters/PoliticsNews' },
  { name: 'NPR Politics',       url: 'https://feeds.npr.org/1014/rss.xml'             },
  { name: 'BBC Politics',       url: 'https://feeds.bbci.co.uk/news/politics/rss.xml' },
  { name: 'The Hill',           url: 'https://thehill.com/homenews/feed/'             },
  { name: 'Politico',           url: 'https://rss.politico.com/politics-news.xml'     },
]

export interface NewsStory {
  title: string
  url: string
  content: string
  source: string
}

/**
 * Pick a random article from a random political news feed.
 * Uses embedded feed content when available; falls back to scraping.
 * Tries multiple feeds until one yields a usable article.
 */
export async function fetchRandomPoliticsStory(): Promise<NewsStory> {
  const shuffledFeeds = [...FEEDS].sort(() => Math.random() - 0.5)

  for (const feed of shuffledFeeds) {
    try {
      const parsed = await parser.parseURL(feed.url)
      const items = parsed.items
        .filter(i => i.link && i.title)
        .sort(() => Math.random() - 0.5)
        .slice(0, 10) // sample up to 10 per feed

      for (const item of items) {
        const url = item.link!
        const title = item.title!

        // Some feeds include full article HTML in content:encoded or content
        const embeddedHtml =
          (item as Record<string, unknown>)['content:encoded'] as string | undefined
          ?? item.content

        if (embeddedHtml && embeddedHtml.length > 500) {
          const text = cleanHnText(embeddedHtml)
          if (text.length >= 300) {
            return { title, url, content: text, source: feed.name }
          }
        }

        // Fall back to fetching and scraping the article URL
        const content = await fetchArticleContent(url)
        if (content) {
          return { title, url, content, source: feed.name }
        }
      }
    } catch {
      // Feed unreachable or parse error — try next
    }
  }

  throw new Error('Could not find a usable article from any political news feed')
}
