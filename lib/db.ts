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
  qualitative_feedback: string | null
}): Promise<string> {
  const rows = await sql`
    INSERT INTO ratings (
      article_id,
      summary_a_id,
      summary_b_id,
      winner_id,
      user_education,
      user_study_field,
      user_news_frequency,
      qualitative_feedback
    )
    VALUES (
      ${data.article_id},
      ${data.summary_a_id},
      ${data.summary_b_id},
      ${data.winner_id},
      ${data.user_education},
      ${data.user_study_field},
      ${data.user_news_frequency},
      ${data.qualitative_feedback}
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

// ── Analysis ──────────────────────────────────────────────────────────────────

/** Articles where both LLM and human difficulty scores exist. */
export async function getDifficultyAlignment(): Promise<
  { llm_score: number; human_score: number }[]
> {
  const rows = await sql`
    SELECT
      difficulty_llm_avg::float                                      AS llm_score,
      CASE
        WHEN difficulty_user_agrees = true  THEN difficulty_llm_avg::float
        WHEN difficulty_user_agrees = false THEN difficulty_user_score::float
      END                                                            AS human_score
    FROM articles
    WHERE difficulty_llm_avg IS NOT NULL
      AND difficulty_user_agrees IS NOT NULL
  `
  return rows as { llm_score: number; human_score: number }[]
}

/** Avg metric scores per summariser model — LLM judges vs human raters. */
export async function getModelMetricScores(): Promise<{
  llm:   { model: string; metric: string; avg_score: number }[]
  human: { model: string; metric: string; avg_score: number }[]
}> {
  const [llmRows, humanRows] = await Promise.all([
    sql`
      SELECT s.model, lme.metric,
             ROUND(AVG(lme.score)::numeric, 2)::float AS avg_score
      FROM llm_metric_evaluations lme
      JOIN summaries s ON s.id = lme.summary_id
      GROUP BY s.model, lme.metric
    `,
    sql`
      SELECT s.model, ms.metric,
             ROUND(AVG(ms.score)::numeric, 2)::float AS avg_score
      FROM metric_scores ms
      JOIN summaries s ON s.id = ms.summary_id
      GROUP BY s.model, ms.metric
    `,
  ])
  return {
    llm:   llmRows   as { model: string; metric: string; avg_score: number }[],
    human: humanRows as { model: string; metric: string; avg_score: number }[],
  }
}

/**
 * For each completed rating, check whether the LLM judges (by avg score across
 * all metrics) preferred the same summary that the human did.
 */
export async function getLlmHumanAgreement(): Promise<{
  total: number
  agreements: number
}> {
  const rows = await sql`
    WITH llm_avgs AS (
      SELECT article_id, summary_id, AVG(score) AS avg_score
      FROM llm_metric_evaluations
      GROUP BY article_id, summary_id
    )
    SELECT
      COUNT(*)::int                                                          AS total,
      SUM(CASE WHEN llm_pick.summary_id = r.winner_id THEN 1 ELSE 0 END)::int AS agreements
    FROM ratings r
    JOIN LATERAL (
      SELECT la.summary_id
      FROM llm_avgs la
      WHERE la.article_id = r.article_id
        AND (la.summary_id = r.summary_a_id OR la.summary_id = r.summary_b_id)
      ORDER BY la.avg_score DESC
      LIMIT 1
    ) AS llm_pick ON true
  `
  const row = rows[0] as { total: number; agreements: number } | undefined
  return row ?? { total: 0, agreements: 0 }
}

/**
 * Per metric: average LLM score for the human-preferred summary vs the other.
 * Shows which metrics most separate winners from losers in the LLM's view.
 */
export async function getLlmMetricWinnerGap(): Promise<
  { metric: string; winner_avg: number; loser_avg: number }[]
> {
  const rows = await sql`
    SELECT
      lme.metric,
      ROUND(AVG(CASE WHEN lme.summary_id = r.winner_id THEN lme.score END)::numeric, 2)::float
        AS winner_avg,
      ROUND(AVG(CASE WHEN lme.summary_id != r.winner_id THEN lme.score END)::numeric, 2)::float
        AS loser_avg
    FROM llm_metric_evaluations lme
    JOIN ratings r
      ON  r.article_id = lme.article_id
      AND (r.summary_a_id = lme.summary_id OR r.summary_b_id = lme.summary_id)
    GROUP BY lme.metric
    ORDER BY (
      AVG(CASE WHEN lme.summary_id = r.winner_id  THEN lme.score END) -
      AVG(CASE WHEN lme.summary_id != r.winner_id THEN lme.score END)
    ) DESC NULLS LAST
  `
  return rows as { metric: string; winner_avg: number; loser_avg: number }[]
}

/** Win rate per education level per model. */
export async function getEducationModelPreferences(): Promise<
  { user_education: string; model: string; wins: number; appearances: number; win_rate_pct: number }[]
> {
  const rows = await sql`
    WITH apps AS (
      SELECT r.user_education, s.model, COUNT(*) AS total
      FROM ratings r
      JOIN summaries s ON s.id = r.summary_a_id OR s.id = r.summary_b_id
      WHERE r.user_education IS NOT NULL
      GROUP BY r.user_education, s.model
    ),
    wins AS (
      SELECT r.user_education, s.model, COUNT(*) AS wins
      FROM ratings r
      JOIN summaries s ON s.id = r.winner_id
      WHERE r.user_education IS NOT NULL
      GROUP BY r.user_education, s.model
    )
    SELECT
      a.user_education,
      a.model,
      COALESCE(w.wins, 0)::int                                              AS wins,
      a.total::int                                                           AS appearances,
      ROUND(COALESCE(w.wins,0)::numeric / NULLIF(a.total,0) * 100, 1)::float AS win_rate_pct
    FROM apps a
    LEFT JOIN wins w USING (user_education, model)
    ORDER BY a.user_education, win_rate_pct DESC
  `
  return rows as {
    user_education: string; model: string; wins: number
    appearances: number; win_rate_pct: number
  }[]
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
        WHERE ms0.rating_id = r.id
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
