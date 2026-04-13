import { NextRequest, NextResponse } from 'next/server'
import { createRating, createMetricScores, getSummaryModel } from '@/lib/db'
import { MODELS } from '@/lib/groq'

const MODEL_NAMES = Object.fromEntries(MODELS.map(m => [m.id, m.name]))

export async function POST(req: NextRequest) {
  try {
    const { article_id, summary_a_id, summary_b_id, winner_id, metric_scores } = await req.json()

    if (!article_id || !summary_a_id || !summary_b_id || !winner_id || !metric_scores) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Persist the rating
    const rating_id = await createRating({ article_id, summary_a_id, summary_b_id, winner_id })

    // Persist metric scores
    await createMetricScores(
      metric_scores.map((s: { summary_id: string; metric: string; score: number }) => ({
        ...s,
        rating_id,
      }))
    )

    // Look up model names for the reveal (now that rating is saved we can reveal)
    const [modelA, modelB] = await Promise.all([
      getSummaryModel(summary_a_id),
      getSummaryModel(summary_b_id),
    ])

    return NextResponse.json({
      reveal: {
        summary_a: MODEL_NAMES[modelA] ?? modelA,
        summary_b: MODEL_NAMES[modelB] ?? modelB,
        winner: MODEL_NAMES[winner_id === summary_a_id ? modelA : modelB] ?? 'Unknown',
      },
    })
  } catch (err) {
    console.error('[/api/ratings]', err)
    return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 })
  }
}
