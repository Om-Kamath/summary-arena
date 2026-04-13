import { NextResponse } from 'next/server'
import { fetchRandomStory } from '@/lib/hackernews'
import { fetchArticleContent, cleanHnText } from '@/lib/extract'
import { upsertArticle } from '@/lib/db'

export const maxDuration = 30

export async function GET() {
  try {
    const story = await fetchRandomStory()

    let content: string | null = null

    // Try fetching from the external URL first
    if (story.url) {
      content = await fetchArticleContent(story.url)
    }

    // Fall back to the HN text field (Ask HN / Show HN posts)
    if (!content && story.text) {
      content = cleanHnText(story.text)
    }

    if (!content) {
      return NextResponse.json({ error: 'Could not extract article content' }, { status: 422 })
    }

    const db_id = await upsertArticle({
      hn_id: story.id,
      title: story.title,
      url: story.url,
      content,
    })

    return NextResponse.json({
      db_id,
      hn_id: story.id,
      title: story.title,
      url: story.url ?? null,
      content,
    })
  } catch (err) {
    console.error('[/api/article]', err)
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 })
  }
}
