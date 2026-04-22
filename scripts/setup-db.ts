/**
 * Run once (or after schema changes) to create the database tables in Neon:
 *   npm run db:setup
 *
 * Requires DATABASE_URL in `.env` and/or `.env.local` (same merge order as Next: `.env` then `.env.local` wins).
 * WARNING: drops and recreates all tables — do not run against production data.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(filename: string) {
  const envPath = resolve(process.cwd(), filename)
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

import { neon } from '@neondatabase/serverless'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)

  console.log('Dropping existing tables...')
  await sql`DROP TABLE IF EXISTS metric_scores CASCADE`
  await sql`DROP TABLE IF EXISTS ratings CASCADE`
  await sql`DROP TABLE IF EXISTS llm_metric_evaluations CASCADE`
  await sql`DROP TABLE IF EXISTS summaries CASCADE`
  await sql`DROP TABLE IF EXISTS articles CASCADE`

  console.log('Creating tables...')

  await sql`
    CREATE TABLE articles (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_url TEXT UNIQUE NOT NULL,
      title      TEXT NOT NULL,
      source     TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      difficulty_llm_avg      REAL,
      difficulty_llm_scores   JSONB,
      difficulty_user_agrees  BOOLEAN,
      difficulty_user_score   INTEGER CHECK (difficulty_user_score IS NULL OR difficulty_user_score BETWEEN 1 AND 10)
    )
  `

  await sql`
    CREATE TABLE summaries (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      model      TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE ratings (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id   UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      summary_a_id UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
      summary_b_id UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
      winner_id    UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      user_education       TEXT,
      user_study_field     TEXT,
      user_news_frequency  TEXT,
      qualitative_feedback TEXT
    )
  `

  await sql`
    CREATE TABLE metric_scores (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rating_id  UUID NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
      summary_id UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
      metric     TEXT NOT NULL,
      score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE llm_metric_evaluations (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      summary_id  UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
      judge_model TEXT NOT NULL,
      metric      TEXT NOT NULL,
      score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX idx_llm_metric_eval_article ON llm_metric_evaluations(article_id)`
  await sql`CREATE INDEX idx_llm_metric_eval_summary ON llm_metric_evaluations(summary_id)`

  console.log('Done. All tables created.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
