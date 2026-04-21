import { NextRequest, NextResponse } from 'next/server'
import { getArticleContent, updateArticleDifficultyLlm } from '@/lib/db'
import { pickThreeModels, rateSummarizationDifficulty } from '@/lib/groq'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { article_id } = await req.json()
    if (!article_id || typeof article_id !== 'string') {
      return NextResponse.json({ error: 'article_id is required' }, { status: 400 })
    }

    const content = await getArticleContent(article_id)
    if (!content) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    const [m1, m2, m3] = pickThreeModels()
    const [s1, s2, s3] = await Promise.all([
      rateSummarizationDifficulty(content, m1.id),
      rateSummarizationDifficulty(content, m2.id),
      rateSummarizationDifficulty(content, m3.id),
    ])

    const scores = [
      { model_id: m1.id, score: s1 },
      { model_id: m2.id, score: s2 },
      { model_id: m3.id, score: s3 },
    ]
    const avg = Math.round(((s1 + s2 + s3) / 3) * 10) / 10

    await updateArticleDifficultyLlm(article_id, avg, scores)

    return NextResponse.json({ avg, scores })
  } catch (err) {
    console.error('[/api/difficulty]', err)
    return NextResponse.json({ error: 'Failed to score difficulty' }, { status: 500 })
  }
}
