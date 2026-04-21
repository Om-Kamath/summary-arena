import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL!)

// ── Articles ──────────────────────────────────────────────────────────────────

export async function upsertArticle(data: {
  source_url: string
  title: string
  source: string
  content: string
}): Promise<string> {
  const rows = await sql`
    INSERT INTO articles (source_url, title, source, content)
    VALUES (${data.source_url}, ${data.title}, ${data.source}, ${data.content})
    ON CONFLICT (source_url) DO UPDATE
      SET content = EXCLUDED.content,
          title   = EXCLUDED.title
    RETURNING id
  `
  return rows[0].id as string
}

export async function getArticleContent(articleId: string): Promise<string | null> {
  const rows = await sql`
    SELECT content FROM articles WHERE id = ${articleId}
  `
  return (rows[0]?.content as string | undefined) ?? null
}

export async function updateArticleDifficultyLlm(
  articleId: string,
  avg: number,
  scores: { model_id: string; score: number }[]
): Promise<void> {
  const json = JSON.stringify(scores)
  await sql`
    UPDATE articles
    SET difficulty_llm_avg = ${avg},
        difficulty_llm_scores = ${json}::jsonb
    WHERE id = ${articleId}
  `
}

export async function updateArticleDifficultyUserFeedback(
  articleId: string,
  agrees: boolean,
  userScore: number | null
): Promise<void> {
  await sql`
    UPDATE articles
    SET difficulty_user_agrees = ${agrees},
        difficulty_user_score = ${userScore}
    WHERE id = ${articleId}
  `
}

// ── Summaries ─────────────────────────────────────────────────────────────────

export async function createSummary(data: {
  article_id: string
  model: string
  content: string
}): Promise<string> {
  const rows = await sql`
    INSERT INTO summaries (article_id, model, content)
    VALUES (${data.article_id}, ${data.model}, ${data.content})
    RETURNING id
  `
  return rows[0].id as string
}

export async function getSummaryModel(id: string): Promise<string> {
  const rows = await sql`SELECT model FROM summaries WHERE id = ${id}`
  return rows[0]?.model as string
}

export async function getSummaryRow(id: string): Promise<{
  id: string
  article_id: string
  content: string
} | null> {
  const rows = await sql`
    SELECT id, article_id, content FROM summaries WHERE id = ${id}
  `
  const r = rows[0] as { id: string; article_id: string; content: string } | undefined
  return r ?? null
}

export async function insertLlmMetricEvaluations(
  rows: { article_id: string; summary_id: string; judge_model: string; metric: string; score: number }[]
): Promise<void> {
  for (const r of rows) {
    await sql`
      INSERT INTO llm_metric_evaluations (article_id, summary_id, judge_model, metric, score)
      VALUES (${r.article_id}, ${r.summary_id}, ${r.judge_model}, ${r.metric}, ${r.score})
    `
  }
}

// ── Ratings ───────────────────────────────────────────────────────────────────

export async function createRating(data: {
  article_id: string
  summary_a_id: string
  summary_b_id: string
  winner_id: string
  user_education: string
  user_study_field: string
  user_news_frequency: string
}): Promise<string> {
  const rows = await sql`
    INSERT INTO ratings (
      article_id,
      summary_a_id,
      summary_b_id,
      winner_id,
      user_education,
      user_study_field,
      user_news_frequency
    )
    VALUES (
      ${data.article_id},
      ${data.summary_a_id},
      ${data.summary_b_id},
      ${data.winner_id},
      ${data.user_education},
      ${data.user_study_field},
      ${data.user_news_frequency}
    )
    RETURNING id
  `
  return rows[0].id as string
}

export async function createMetricScores(
  scores: { rating_id: string; summary_id: string; metric: string; score: number }[]
): Promise<void> {
  for (const s of scores) {
    await sql`
      INSERT INTO metric_scores (rating_id, summary_id, metric, score)
      VALUES (${s.rating_id}, ${s.summary_id}, ${s.metric}, ${s.score})
    `
  }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardRow {
  model: string
  total_appearances: number
  total_wins: number
  win_rate_pct: number
  avg_accuracy: number | null
  avg_neutrality: number | null
  avg_completeness: number | null
  avg_conciseness: number | null
}

/** Leaderboard uses only human `ratings` + `metric_scores`; LLM rows in `llm_metric_evaluations` are excluded. */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await sql`
    WITH model_appearances AS (
      SELECT
        s.model,
        r.id AS rating_id,
        (r.winner_id = s.id) AS is_winner
      FROM summaries s
      JOIN ratings r ON (r.summary_a_id = s.id OR r.summary_b_id = s.id)
      WHERE EXISTS (
        SELECT 1 FROM metric_scores ms0
        WHERE ms0.rating_id = r.id AND ms0.summary_id = s.id
      )
    ),
    model_agg AS (
      SELECT
        model,
        COUNT(*)::bigint AS total_appearances,
        SUM(CASE WHEN is_winner THEN 1 ELSE 0 END)::bigint AS total_wins
      FROM model_appearances
      GROUP BY model
    ),
    model_metrics AS (
      SELECT
        s.model,
        ms.metric,
        AVG(ms.score) AS avg_score
      FROM metric_scores ms
      JOIN ratings r ON r.id = ms.rating_id
      JOIN summaries s ON s.id = ms.summary_id
      GROUP BY s.model, ms.metric
    )
    SELECT
      agg.model,
      agg.total_appearances::int                                                AS total_appearances,
      agg.total_wins::int                                                       AS total_wins,
      ROUND(
        agg.total_wins::numeric / NULLIF(agg.total_appearances, 0) * 100, 1
      )                                                                         AS win_rate_pct,
      MAX(CASE WHEN mm.metric = 'accuracy'     THEN mm.avg_score END)          AS avg_accuracy,
      MAX(CASE WHEN mm.metric = 'neutrality'   THEN mm.avg_score END)          AS avg_neutrality,
      MAX(CASE WHEN mm.metric = 'completeness' THEN mm.avg_score END)          AS avg_completeness,
      MAX(CASE WHEN mm.metric = 'conciseness'  THEN mm.avg_score END)          AS avg_conciseness
    FROM model_agg agg
    LEFT JOIN model_metrics mm ON mm.model = agg.model
    GROUP BY agg.model, agg.total_appearances, agg.total_wins
    ORDER BY win_rate_pct DESC
  `
  return rows as LeaderboardRow[]
}
