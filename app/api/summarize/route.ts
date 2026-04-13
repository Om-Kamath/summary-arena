import { NextRequest, NextResponse } from 'next/server'
import { pickTwoModels, generateSummary } from '@/lib/groq'
import { createSummary } from '@/lib/db'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { article_id, content } = await req.json()

    if (!article_id || !content) {
      return NextResponse.json({ error: 'article_id and content are required' }, { status: 400 })
    }

    const [modelA, modelB] = pickTwoModels()

    // Generate both summaries in parallel
    const [textA, textB] = await Promise.all([
      generateSummary(content, modelA.id),
      generateSummary(content, modelB.id),
    ])

    // Persist summaries (model name stored in DB, not exposed to client)
    const [idA, idB] = await Promise.all([
      createSummary({ article_id, model: modelA.id, content: textA }),
      createSummary({ article_id, model: modelB.id, content: textB }),
    ])

    // Randomly assign labels so model order doesn't bias results
    const flip = Math.random() < 0.5
    const summaries = flip
      ? [
          { id: idA, label: 'A', content: textA },
          { id: idB, label: 'B', content: textB },
        ]
      : [
          { id: idB, label: 'A', content: textB },
          { id: idA, label: 'B', content: textA },
        ]

    return NextResponse.json({ summaries })
  } catch (err) {
    console.error('[/api/summarize]', err)
    return NextResponse.json({ error: 'Failed to generate summaries' }, { status: 500 })
  }
}
