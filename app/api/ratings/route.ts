import { NextRequest, NextResponse } from 'next/server'
import {
  createRating,
  createMetricScores,
  getSummaryModel,
  updateArticleDifficultyUserFeedback,
} from '@/lib/db'
import { MODELS } from '@/lib/groq'
import {
  isValidEducation,
  isValidNewsFrequency,
  isValidStudyField,
} from '@/lib/rater-demographics'

const MODEL_NAMES = Object.fromEntries(MODELS.map(m => [m.id, m.name]))

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      article_id,
      summary_a_id,
      summary_b_id,
      winner_id,
      metric_scores,
      difficulty_user_agrees,
      difficulty_user_score,
      user_education,
      user_study_field,
      user_news_frequency,
    } = body

    if (!article_id || !summary_a_id || !summary_b_id || !winner_id || !metric_scores) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isValidEducation(user_education)) {
      return NextResponse.json({ error: 'Invalid or missing user_education' }, { status: 400 })
    }
    if (!isValidStudyField(user_study_field)) {
      return NextResponse.json({ error: 'Invalid or missing user_study_field' }, { status: 400 })
    }
    if (!isValidNewsFrequency(user_news_frequency)) {
      return NextResponse.json({ error: 'Invalid or missing user_news_frequency' }, { status: 400 })
    }

    if (difficulty_user_agrees !== undefined && difficulty_user_agrees !== null) {
      if (typeof difficulty_user_agrees !== 'boolean') {
        return NextResponse.json({ error: 'difficulty_user_agrees must be a boolean' }, { status: 400 })
      }
      if (difficulty_user_agrees === false) {
        const s = difficulty_user_score
        if (
          typeof s !== 'number' ||
          !Number.isInteger(s) ||
          s < 1 ||
          s > 10
        ) {
          return NextResponse.json(
            { error: 'difficulty_user_score (integer 1–10) is required when difficulty_user_agrees is false' },
            { status: 400 }
          )
        }
      }
    }

    // Persist the rating
    const rating_id = await createRating({
      article_id,
      summary_a_id,
      summary_b_id,
      winner_id,
      user_education,
      user_study_field,
      user_news_frequency,
    })

    // Persist metric scores
    await createMetricScores(
      metric_scores.map((s: { summary_id: string; metric: string; score: number }) => ({
        ...s,
        rating_id,
      }))
    )

    if (typeof difficulty_user_agrees === 'boolean') {
      const userScore =
        difficulty_user_agrees === false ? (difficulty_user_score as number) : null
      await updateArticleDifficultyUserFeedback(article_id, difficulty_user_agrees, userScore)
    }

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
