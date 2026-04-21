import { NextRequest, NextResponse } from 'next/server'
import {
  getArticleContent,
  getSummaryRow,
  insertLlmMetricEvaluations,
} from '@/lib/db'
import { EVAL_METRIC_KEYS, evaluateBothSummariesMetrics, pickThreeModels } from '@/lib/groq'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { article_id, summary_a_id, summary_b_id } = body

    if (!article_id || !summary_a_id || !summary_b_id) {
      return NextResponse.json(
        { error: 'article_id, summary_a_id, and summary_b_id are required' },
        { status: 400 }
      )
    }

    const [articleContent, rowA, rowB] = await Promise.all([
      getArticleContent(article_id),
      getSummaryRow(summary_a_id),
      getSummaryRow(summary_b_id),
    ])

    if (!articleContent || !rowA || !rowB) {
      return NextResponse.json({ error: 'Article or summaries not found' }, { status: 404 })
    }

    if (rowA.article_id !== article_id || rowB.article_id !== article_id) {
      return NextResponse.json({ error: 'Summaries do not belong to this article' }, { status: 400 })
    }

    const summaryIds = [rowA.id, rowB.id] as const

    const [j1, j2, j3] = pickThreeModels()

    const [block1, block2, block3] = await Promise.all([
      evaluateBothSummariesMetrics(
        articleContent,
        rowA.id,
        rowA.content,
        rowB.id,
        rowB.content,
        j1.id
      ),
      evaluateBothSummariesMetrics(
        articleContent,
        rowA.id,
        rowA.content,
        rowB.id,
        rowB.content,
        j2.id
      ),
      evaluateBothSummariesMetrics(
        articleContent,
        rowA.id,
        rowA.content,
        rowB.id,
        rowB.content,
        j3.id
      ),
    ])

    const rows: {
      article_id: string
      summary_id: string
      judge_model: string
      metric: string
      score: number
    }[] = []

    function pushJudge(judgeId: string, block: typeof block1) {
      for (const summaryId of summaryIds) {
        const metrics = block[summaryId]
        if (!metrics) continue
        for (const key of EVAL_METRIC_KEYS) {
          rows.push({
            article_id,
            summary_id: summaryId,
            judge_model: judgeId,
            metric: key,
            score: metrics[key],
          })
        }
      }
    }

    pushJudge(j1.id, block1)
    pushJudge(j2.id, block2)
    pushJudge(j3.id, block3)

    await insertLlmMetricEvaluations(rows)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/llm_evaluate_response]', err)
    return NextResponse.json({ error: 'Failed to run LLM evaluation' }, { status: 500 })
  }
}
