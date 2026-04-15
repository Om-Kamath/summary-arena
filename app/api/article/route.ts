import { NextResponse } from 'next/server'
import { fetchRandomPoliticsStory } from '@/lib/rss'
import { upsertArticle } from '@/lib/db'

export const maxDuration = 30

export async function GET() {
  try {
    const story = await fetchRandomPoliticsStory()

    const db_id = await upsertArticle({
      source_url: story.url,
      title:      story.title,
      source:     story.source,
      content:    story.content,
    })

    return NextResponse.json({
      db_id,
      title:   story.title,
      url:     story.url,
      content: story.content,
      source:  story.source,
    })
  } catch (err) {
    console.error('[/api/article]', err)
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 })
  }
}
