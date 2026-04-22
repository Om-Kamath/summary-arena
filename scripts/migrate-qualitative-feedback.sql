-- Non-destructive migration: run once against an existing Neon database.
-- psql "$DATABASE_URL" -f scripts/migrate-qualitative-feedback.sql

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS qualitative_feedback TEXT;
