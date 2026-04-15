/**
 * Run once (or after schema changes) to create the database tables in Neon:
 *   npm run db:setup
 *
 * Requires DATABASE_URL to be set in .env.local
 * WARNING: drops and recreates all tables — do not run against production data.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
}

import { neon } from '@neondatabase/serverless'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)

  console.log('Dropping existing tables...')
  await sql`DROP TABLE IF EXISTS metric_scores CASCADE`
  await sql`DROP TABLE IF EXISTS ratings CASCADE`
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
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      created_at   TIMESTAMPTZ DEFAULT NOW()
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

  console.log('Done. All tables created.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
