-- Non-destructive migration: run once against an existing Neon database.
-- psql "$DATABASE_URL" -f scripts/migrate-difficulty-llm-eval.sql

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS difficulty_llm_avg REAL,
  ADD COLUMN IF NOT EXISTS difficulty_llm_scores JSONB,
  ADD COLUMN IF NOT EXISTS difficulty_user_agrees BOOLEAN,
  ADD COLUMN IF NOT EXISTS difficulty_user_score INTEGER;

CREATE TABLE IF NOT EXISTS llm_metric_evaluations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  summary_id  UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  judge_model TEXT NOT NULL,
  metric      TEXT NOT NULL,
  score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_metric_eval_article ON llm_metric_evaluations(article_id);
CREATE INDEX IF NOT EXISTS idx_llm_metric_eval_summary ON llm_metric_evaluations(summary_id);

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS user_education TEXT,
  ADD COLUMN IF NOT EXISTS user_study_field TEXT,
  ADD COLUMN IF NOT EXISTS user_news_frequency TEXT;
