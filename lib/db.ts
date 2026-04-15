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

// ── Ratings ───────────────────────────────────────────────────────────────────

export async function createRating(data: {
  article_id: string
  summary_a_id: string
  summary_b_id: string
  winner_id: string
}): Promise<string> {
  const rows = await sql`
    INSERT INTO ratings (article_id, summary_a_id, summary_b_id, winner_id)
    VALUES (${data.article_id}, ${data.summary_a_id}, ${data.summary_b_id}, ${data.winner_id})
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

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await sql`
    WITH model_appearances AS (
      SELECT
        s.model,
        r.id AS rating_id,
        (r.winner_id = s.id) AS is_winner
      FROM summaries s
      JOIN ratings r ON (r.summary_a_id = s.id OR r.summary_b_id = s.id)
    ),
    model_metrics AS (
      SELECT
        s.model,
        ms.metric,
        AVG(ms.score) AS avg_score
      FROM summaries s
      JOIN metric_scores ms ON ms.summary_id = s.id
      GROUP BY s.model, ms.metric
    )
    SELECT
      ma.model,
      COUNT(*)                                                                AS total_appearances,
      SUM(CASE WHEN ma.is_winner THEN 1 ELSE 0 END)                         AS total_wins,
      ROUND(
        SUM(CASE WHEN ma.is_winner THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1
      )                                                                       AS win_rate_pct,
      MAX(CASE WHEN mm.metric = 'accuracy'     THEN mm.avg_score END)        AS avg_accuracy,
      MAX(CASE WHEN mm.metric = 'neutrality'   THEN mm.avg_score END)        AS avg_neutrality,
      MAX(CASE WHEN mm.metric = 'completeness' THEN mm.avg_score END)        AS avg_completeness,
      MAX(CASE WHEN mm.metric = 'conciseness'  THEN mm.avg_score END)        AS avg_conciseness
    FROM model_appearances ma
    LEFT JOIN model_metrics mm ON mm.model = ma.model
    GROUP BY ma.model
    ORDER BY win_rate_pct DESC
  `
  return rows as LeaderboardRow[]
}
