'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  db_id: string
  hn_id: number
  title: string
  url: string | null
  content: string
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
  winner: string
}

type Step = 'loading' | 'ready' | 'picked' | 'submitting' | 'reveal' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS = [
  { key: 'accuracy',     label: 'Accuracy',     desc: 'Does it accurately represent the article?' },
  { key: 'neutrality',   label: 'Neutrality',   desc: 'Is the tone neutral and unbiased?'         },
  { key: 'completeness', label: 'Completeness', desc: 'Does it cover the key points?'             },
  { key: 'conciseness',  label: 'Conciseness',  desc: 'Is it appropriately brief?'                },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-slate-400">
      <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-sm">Fetching article and generating summaries&hellip;</span>
    </div>
  )
}

function StarRating({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
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
  const [step, setStep]         = useState<Step>('loading')
  const [article, setArticle]   = useState<Article | null>(null)
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [winner, setWinner]     = useState<Summary | null>(null)
  const [scores, setScores]     = useState<MetricScores>({})
  const [reveal, setReveal]     = useState<Reveal | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setStep('loading')
    setArticle(null)
    setSummaries([])
    setWinner(null)
    setScores({})
    setReveal(null)
    setError(null)

    try {
      // Step 1 — fetch article
      const artRes = await fetch('/api/article')
      if (!artRes.ok) throw new Error('Could not fetch article')
      const art: Article = await artRes.json()
      setArticle(art)

      // Step 2 — generate summaries
      const sumRes = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: art.db_id, content: art.content }),
      })
      if (!sumRes.ok) throw new Error('Could not generate summaries')
      const { summaries: s }: { summaries: Summary[] } = await sumRes.json()
      setSummaries(s)
      setStep('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handlePick(s: Summary) {
    setWinner(s)
    setStep('picked')
  }

  function setScore(summaryId: string, metric: string, score: number) {
    setScores(prev => ({
      ...prev,
      [summaryId]: { ...(prev[summaryId] ?? {}), [metric]: score },
    }))
  }

  function allFilled() {
    return summaries.every(s => METRICS.every(m => scores[s.id]?.[m.key] !== undefined))
  }

  async function handleSubmit() {
    if (!article || !winner) return
    setStep('submitting')

    const metric_scores = summaries.flatMap(s =>
      METRICS.map(m => ({
        summary_id: s.id,
        metric: m.key,
        score: scores[s.id]?.[m.key] ?? 3,
      }))
    )

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
        }),
      })
      if (!res.ok) throw new Error('Failed to submit rating')
      const data = await res.json()
      setReveal(data.reveal)
      setStep('reveal')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit')
      setStep('error')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === 'loading') return <Spinner />

  if (step === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-slate-500">{error}</p>
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
            Hacker News
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
          <p className="line-clamp-4 text-sm leading-relaxed text-slate-500">
            {article.content}
          </p>
        </div>
      )}

      {/* ── Step 1: A/B pick ── */}
      {(step === 'ready' || step === 'picked') && summaries.length === 2 && (
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

          {winner && step === 'picked' && (
            <p className="mt-3 text-right text-sm text-indigo-600 font-medium">
              ↓ Scroll down to rate on specific metrics
            </p>
          )}
        </section>
      )}

      {/* ── Step 2: Metric ratings ── */}
      {(step === 'picked' || step === 'submitting') && winner && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Step 2 of 2</h2>
          <p className="mb-6 text-sm text-slate-500">Rate each summary on these dimensions (1 = poor, 5 = excellent).</p>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 text-left font-medium text-slate-600">Metric</th>
                  {summaries.map(s => (
                    <th key={s.id} className="px-5 py-3 text-center font-medium text-slate-600">
                      Summary {s.label}
                      {winner.id === s.id && (
                        <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-600">
                          preferred
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m, i) => (
                  <tr
                    key={m.key}
                    className={i < METRICS.length - 1 ? 'border-b border-slate-100' : ''}
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{m.label}</p>
                      <p className="text-xs text-slate-400">{m.desc}</p>
                    </td>
                    {summaries.map(s => (
                      <td key={s.id} className="px-5 py-4 text-center">
                        <div className="flex justify-center">
                          <StarRating
                            value={scores[s.id]?.[m.key] ?? 0}
                            onChange={v => setScore(s.id, m.key, v)}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {allFilled() ? 'All metrics rated. Ready to submit.' : 'Rate all metrics to submit.'}
            </p>
            <button
              onClick={handleSubmit}
              disabled={!allFilled() || step === 'submitting'}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === 'submitting' ? 'Submitting…' : 'Submit Rating'}
            </button>
          </div>
        </section>
      )}

      {/* ── Reveal ── */}
      {step === 'reveal' && reveal && (
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
                  <p className="mt-1 text-xs text-indigo-600 font-medium">Your pick</p>
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
