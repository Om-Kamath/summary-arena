'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  EDUCATION_OPTIONS,
  NEWS_FREQUENCY_OPTIONS,
  STUDY_FIELD_OPTIONS,
} from '@/lib/rater-demographics'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  db_id: string
  title: string
  url: string | null
  content: string
  source: string
}

interface Summary {
  id: string
  label: 'A' | 'B'
  content: string
}

interface MetricScores {
  [summaryId: string]: { [metric: string]: number }
}

interface Reveal {
  summary_a: string
  summary_b: string
}

type RatingStep = 'loading' | 'ready' | 'picked' | 'submitting' | 'reveal'

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS = [
  { key: 'accuracy',     label: 'Accuracy',     desc: 'Does it accurately represent the article?' },
  { key: 'neutrality',   label: 'Neutrality',   desc: 'Is the tone neutral and unbiased?'         },
  { key: 'completeness', label: 'Completeness', desc: 'Does it cover the key points?'             },
  { key: 'conciseness',  label: 'Conciseness',  desc: 'Is it appropriately brief?'                },
]

const selectClass =
  'mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm'

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  )
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`text-2xl leading-none transition-colors ${
            star <= (hover || value) ? 'text-amber-400' : 'text-slate-200'
          }`}
          aria-label={`${star} star`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [article, setArticle]       = useState<Article | null>(null)
  const [articleError, setArticleError] = useState<string | null>(null)
  const [summaries, setSummaries]   = useState<Summary[]>([])
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [ratingStep, setRatingStep] = useState<RatingStep>('loading')
  const [winner, setWinner]         = useState<Summary | null>(null)
  const [scores, setScores]         = useState<MetricScores>({})
  const [qualitativeFeedback, setQualitativeFeedback] = useState('')
  const [reveal, setReveal]         = useState<Reveal | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [difficultyLlmReady, setDifficultyLlmReady] = useState(false)
  const [difficultyLlmAvg, setDifficultyLlmAvg]     = useState<number | null>(null)
  const [difficultyUserAgrees, setDifficultyUserAgrees] = useState<boolean | null>(null)
  const [difficultyUserScore, setDifficultyUserScore]   = useState<number | null>(null)

  const [userEducation, setUserEducation]       = useState('')
  const [userStudyField, setUserStudyField]     = useState('')
  const [userNewsFrequency, setUserNewsFrequency] = useState('')

  const runDifficulty = useCallback(async (dbId: string) => {
    setDifficultyLlmReady(false)
    setDifficultyLlmAvg(null)
    setDifficultyUserAgrees(null)
    setDifficultyUserScore(null)
    try {
      const res = await fetch('/api/difficulty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: dbId }),
      })
      if (!res.ok) throw new Error('difficulty failed')
      const data = (await res.json()) as { avg?: number }
      setDifficultyLlmAvg(typeof data.avg === 'number' ? data.avg : null)
    } catch {
      setDifficultyLlmAvg(null)
    } finally {
      setDifficultyLlmReady(true)
    }
  }, [])

  // ── Load summaries (auto-retries once on failure) ──────────────────────────

  const loadSummaries = useCallback(async (art: Article, attempt = 0) => {
    setRatingStep('loading')
    setSummaryError(null)

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: art.db_id, content: art.content }),
      })
      if (!res.ok) throw new Error('Could not generate summaries')
      const { summaries: s }: { summaries: Summary[] } = await res.json()
      setSummaries(s)
      setRatingStep('ready')

      const sa = s.find(x => x.label === 'A')
      const sb = s.find(x => x.label === 'B')
      if (sa && sb) {
        void fetch('/api/llm_evaluate_response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article_id: art.db_id,
            summary_a_id: sa.id,
            summary_b_id: sb.id,
          }),
        }).catch(() => {})
      }
    } catch (e) {
      if (attempt === 0) {
        // Silent retry once before surfacing the error
        loadSummaries(art, 1)
        return
      }
      setSummaryError(e instanceof Error ? e.message : 'Could not generate summaries')
      setRatingStep('loading') // keeps article visible, summary section shows error
    }
  }, [])

  // ── Load article ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setArticle(null)
    setArticleError(null)
    setSummaries([])
    setSummaryError(null)
    setRatingStep('loading')
    setWinner(null)
    setScores({})
    setQualitativeFeedback('')
    setReveal(null)
    setSubmitError(null)
    setDifficultyLlmReady(false)
    setDifficultyLlmAvg(null)
    setDifficultyUserAgrees(null)
    setDifficultyUserScore(null)
    setUserEducation('')
    setUserStudyField('')
    setUserNewsFrequency('')

    try {
      const res = await fetch('/api/article')
      if (!res.ok) throw new Error('Could not fetch article')
      const art: Article = await res.json()
      setArticle(art)
      await Promise.all([runDifficulty(art.db_id), loadSummaries(art)])
    } catch (e) {
      setArticleError(e instanceof Error ? e.message : 'Could not fetch article')
    }
  }, [loadSummaries, runDifficulty])

  useEffect(() => { load() }, [load])

  // ── Rating handlers ────────────────────────────────────────────────────────

  function handlePick(s: Summary) {
    setWinner(s)
    setRatingStep('picked')
  }

  function setScore(summaryId: string, metric: string, score: number) {
    setScores(prev => ({
      ...prev,
      [summaryId]: { ...(prev[summaryId] ?? {}), [metric]: score },
    }))
  }

  function allFilled() {
    return !!winner && METRICS.every(m => scores[winner.id]?.[m.key] !== undefined)
  }

  function difficultyFeedbackOk() {
    if (!difficultyLlmReady || typeof difficultyLlmAvg !== 'number') return true
    if (difficultyUserAgrees === null) return false
    if (difficultyUserAgrees === false) {
      const u = difficultyUserScore
      return typeof u === 'number' && Number.isInteger(u) && u >= 1 && u <= 10
    }
    return true
  }

  function userDemographicsOk() {
    return userEducation !== '' && userStudyField !== '' && userNewsFrequency !== ''
  }

  async function handleSubmit() {
    if (!article || !winner) return
    setRatingStep('submitting')
    setSubmitError(null)

    const metric_scores = METRICS.map(m => ({
      summary_id: winner.id,
      metric: m.key,
      score: scores[winner.id]?.[m.key] ?? 3,
    }))

    const difficultyPayload =
      difficultyLlmReady && typeof difficultyLlmAvg === 'number' && difficultyUserAgrees !== null
        ? {
            difficulty_user_agrees: difficultyUserAgrees,
            difficulty_user_score: difficultyUserAgrees ? null : difficultyUserScore,
          }
        : {}

    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: article.db_id,
          summary_a_id: summaries.find(s => s.label === 'A')!.id,
          summary_b_id: summaries.find(s => s.label === 'B')!.id,
          winner_id: winner.id,
          metric_scores,
          user_education: userEducation,
          user_study_field: userStudyField,
          user_news_frequency: userNewsFrequency,
          qualitative_feedback: qualitativeFeedback,
          ...difficultyPayload,
        }),
      })
      if (!res.ok) throw new Error('Failed to submit rating')
      const data = await res.json()
      setReveal(data.reveal)
      setRatingStep('reveal')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit')
      setRatingStep('picked')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Full-page loading (no article yet)
  if (!article && !articleError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-400">
        <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm">Fetching article&hellip;</span>
      </div>
    )
  }

  // Article fetch failed
  if (articleError) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-slate-500">{articleError}</p>
        <button
          onClick={load}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── Article card ── */}
      {article && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-indigo-500">
            {article.source}
          </p>
          <h1 className="mb-3 text-xl font-semibold leading-snug text-slate-900">
            {article.url ? (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600 transition-colors"
              >
                {article.title} ↗
              </a>
            ) : (
              article.title
            )}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            {article.content}
          </p>
        </div>
      )}

      {/* ── Summarization difficulty (LLM + user agreement) ── */}
      {article && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Summarization difficulty
          </h2>
          {!difficultyLlmReady && (
            <Spinner label="Three AI models are rating how hard this article is to summarize…" />
          )}
          {difficultyLlmReady && typeof difficultyLlmAvg !== 'number' && (
            <p className="text-sm text-slate-600">
              Model consensus (1–10): <span className="font-semibold text-slate-900">NA</span>
            </p>
          )}
          {difficultyLlmReady && typeof difficultyLlmAvg === 'number' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Average model rating (1 = very easy, 10 = very hard):{' '}
                <span className="font-semibold text-slate-900">{difficultyLlmAvg}</span>
              </p>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-800">
                  Do you agree with this difficulty rating?
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="difficulty-agree"
                      checked={difficultyUserAgrees === true}
                      onChange={() => {
                        setDifficultyUserAgrees(true)
                        setDifficultyUserScore(null)
                      }}
                      className="text-indigo-600"
                    />
                    <span>I agree</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="difficulty-agree"
                      checked={difficultyUserAgrees === false}
                      onChange={() => setDifficultyUserAgrees(false)}
                      className="text-indigo-600"
                    />
                    <span>I disagree</span>
                  </label>
                </div>
              </div>
              {difficultyUserAgrees === false && (
                <div>
                  <label htmlFor="difficulty-user-score" className="mb-1 block text-sm font-medium text-slate-800">
                    What would you rate this article (1–10)?
                  </label>
                  <select
                    id="difficulty-user-score"
                    value={difficultyUserScore ?? ''}
                    onChange={e => {
                      const v = e.target.value
                      setDifficultyUserScore(v === '' ? null : Number(v))
                    }}
                    className={selectClass}
                  >
                    <option value="">Select…</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Summary loading / error ── */}
      {ratingStep === 'loading' && !summaryError && (
        <div className="py-4">
          <Spinner label="Generating summaries with two AI models…" />
        </div>
      )}

      {summaryError && (
        <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-5 py-4">
          <p className="text-sm text-red-600">{summaryError}</p>
          <button
            onClick={() => article && loadSummaries(article)}
            className="ml-4 shrink-0 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── About you (stored with your rating) ── */}
      {(ratingStep === 'ready' || ratingStep === 'picked' || ratingStep === 'submitting') &&
        summaries.length === 2 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            About you
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            These answers are saved with your submission (no account required).
          </p>
          <div className="grid gap-5 sm:grid-cols-1 md:grid-cols-3">
            <div>
              <label htmlFor="user-education" className="block text-sm font-medium text-slate-800">
                Highest educational qualification
              </label>
              <select
                id="user-education"
                value={userEducation}
                onChange={e => setUserEducation(e.target.value)}
                className={selectClass}
              >
                <option value="">Select…</option>
                {EDUCATION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="user-study" className="block text-sm font-medium text-slate-800">
                Main field you study or have studied
              </label>
              <select
                id="user-study"
                value={userStudyField}
                onChange={e => setUserStudyField(e.target.value)}
                className={selectClass}
              >
                <option value="">Select…</option>
                {STUDY_FIELD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="user-news" className="block text-sm font-medium text-slate-800">
                How often do you read news articles?
              </label>
              <select
                id="user-news"
                value={userNewsFrequency}
                onChange={e => setUserNewsFrequency(e.target.value)}
                className={selectClass}
              >
                <option value="">Select…</option>
                {NEWS_FREQUENCY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {/* ── Step 1: A/B pick ── */}
      {(ratingStep === 'ready' || ratingStep === 'picked') && summaries.length === 2 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Step 1 of 2</h2>
          <p className="mb-4 text-sm text-slate-500">Which summary do you prefer overall?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {summaries.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handlePick(s)}
                className={`rounded-xl border-2 bg-white p-5 text-left shadow-sm transition-all ${
                  winner?.id === s.id
                    ? 'border-indigo-500 ring-2 ring-indigo-100'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Summary {s.label}
                  </span>
                  {winner?.id === s.id && (
                    <span className="text-xs font-medium text-indigo-600">Selected</span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-slate-700">{s.content}</p>
              </button>
            ))}
          </div>

          {winner && ratingStep === 'picked' && (
            <p className="mt-3 text-right text-sm font-medium text-indigo-600">
              ↓ Rate your preferred summary below
            </p>
          )}
        </section>
      )}

      {/* ── Step 2: Metric ratings ── */}
      {(ratingStep === 'picked' || ratingStep === 'submitting') && winner && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Step 2 of 2</h2>
          <p className="mb-4 text-sm text-slate-500">
            Rate your preferred summary on these dimensions (1 = poor, 5 = excellent).
          </p>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {METRICS.map(m => (
              <div key={m.key} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-slate-800">{m.label}</p>
                  <p className="text-xs text-slate-400">{m.desc}</p>
                </div>
                <StarRating
                  value={scores[winner.id]?.[m.key] ?? 0}
                  onChange={v => setScore(winner.id, m.key, v)}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <label htmlFor="qualitative-feedback" className="block text-sm font-semibold text-slate-900">
              Feedback <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <p className="mt-1 text-sm text-slate-500">
              What made you prefer Summary {winner.label}, or what stood out about either summary?
            </p>
            <textarea
              id="qualitative-feedback"
              value={qualitativeFeedback}
              onChange={e => setQualitativeFeedback(e.target.value)}
              maxLength={2000}
              rows={4}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="Share what you noticed..."
            />
            <p className="mt-2 text-right text-xs text-slate-400">
              {qualitativeFeedback.length}/2000
            </p>
          </div>

          {submitError && (
            <p className="mt-3 text-sm text-red-500">{submitError}</p>
          )}

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {!allFilled() && 'Rate all metrics to submit.'}
              {allFilled() && !difficultyFeedbackOk() && 'Answer the difficulty question above to submit.'}
              {allFilled() &&
                difficultyFeedbackOk() &&
                !userDemographicsOk() &&
                'Complete the “About you” section above to submit.'}
              {allFilled() && difficultyFeedbackOk() && userDemographicsOk() && 'Ready to submit.'}
            </p>
            <button
              onClick={handleSubmit}
              disabled={
                !allFilled() ||
                !difficultyFeedbackOk() ||
                !userDemographicsOk() ||
                ratingStep === 'submitting'
              }
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ratingStep === 'submitting' ? 'Submitting…' : 'Submit Rating'}
            </button>
          </div>
        </section>
      )}

      {/* ── Reveal ── */}
      {ratingStep === 'reveal' && reveal && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-emerald-800">Rating submitted!</h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {summaries.map(s => (
              <div key={s.id} className="rounded-lg border border-emerald-100 bg-white p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Summary {s.label} was
                </p>
                <p className="font-semibold text-slate-800">
                  {s.label === 'A' ? reveal.summary_a : reveal.summary_b}
                </p>
                {winner?.id === s.id && (
                  <p className="mt-1 text-xs font-medium text-indigo-600">Your pick</p>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={load}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Rate another article
            </button>
            <a
              href="/leaderboard"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:border-indigo-400 transition-colors"
            >
              View leaderboard
            </a>
          </div>
        </section>
      )}
    </div>
  )
}
