import {
  getLeaderboard, getDifficultyAlignment, getModelMetricScores,
  getLlmHumanAgreement, getLlmMetricWinnerGap,
} from '@/lib/db'
import { MODELS } from '@/lib/groq'
import {
  AgreementRing, DifficultyScatter, MetricGapChart, LlmHumanMetricGrid,
  ModelWinRateChart, ModelRadar, PreferredMetricsChart,
  MetricSSDChart, RadarAreaRanking,
} from './charts'

// ── Helpers (server-side only) ────────────────────────────────────────────────

const modelName = (id: string) => MODELS.find(m => m.id === id)?.name ?? id
const n2        = (v: unknown): number => (v == null ? NaN : Number(v))

function pearson(data: { llm_score: unknown; human_score: unknown }[]): number | null {
  const pts = data.map(d => ({ x: n2(d.llm_score), y: n2(d.human_score) }))
                  .filter(d => !isNaN(d.x) && !isNaN(d.y))
  if (pts.length < 3) return null
  const n   = pts.length
  const xm  = pts.reduce((s, d) => s + d.x, 0) / n
  const ym  = pts.reduce((s, d) => s + d.y, 0) / n
  const num  = pts.reduce((s, d) => s + (d.x - xm) * (d.y - ym), 0)
  const xstd = Math.sqrt(pts.reduce((s, d) => s + (d.x - xm) ** 2, 0))
  const ystd = Math.sqrt(pts.reduce((s, d) => s + (d.y - ym) ** 2, 0))
  return xstd && ystd ? num / (xstd * ystd) : null
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-0.5 font-semibold text-slate-900">{title}</p>
      {sub && <p className="mb-4 text-xs text-slate-400">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </div>
  )
}

function SectionHeader({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-500">{n}</p>
      <h2 className="mt-0.5 text-xl font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnalysisPage() {
  const [leaderboard, difficultyData, metricScores, llmAgreement, metricGap] =
    await Promise.all([
      getLeaderboard(), getDifficultyAlignment(), getModelMetricScores(),
      getLlmHumanAgreement(), getLlmMetricWinnerGap(),
    ])

  // ── Difficulty stats ────────────────────────────────────────────────────────
  const diffN          = difficultyData.length
  const diffMAE        = diffN ? difficultyData.reduce((s, d) => s + Math.abs(n2(d.llm_score) - n2(d.human_score)), 0) / diffN : null
  const diffAgreeRate  = diffN ? (difficultyData.filter(d => Math.abs(n2(d.llm_score) - n2(d.human_score)) <= 1).length / diffN) * 100 : null
  const diffR          = pearson(difficultyData)

  // ── Remap model IDs to friendly names for all chart data ───────────────────
  const allModelIds  = Array.from(new Set([...metricScores.llm.map(r => r.model), ...metricScores.human.map(r => r.model)]))
  const friendlyLlm  = metricScores.llm.map(r   => ({ ...r, model: modelName(r.model) }))
  const friendlyHuman= metricScores.human.map(r  => ({ ...r, model: modelName(r.model) }))
  const friendlyModels = allModelIds.map(modelName)

  // ── Win rate chart data ─────────────────────────────────────────────────────
  const winRateData = leaderboard.map(r => ({
    name: modelName(r.model),
    winRate: n2(r.win_rate_pct),
    wins: r.total_wins,
    appearances: r.total_appearances,
  }))

  // ── Radar data ─────────────────────────────────────────────────────────────
  const radarData = leaderboard.map(r => ({
    name: modelName(r.model),
    accuracy:     r.avg_accuracy     != null ? n2(r.avg_accuracy)     : null,
    neutrality:   r.avg_neutrality   != null ? n2(r.avg_neutrality)   : null,
    completeness: r.avg_completeness != null ? n2(r.avg_completeness) : null,
    conciseness:  r.avg_conciseness  != null ? n2(r.avg_conciseness)  : null,
  }))

  // ── 1.4 Sum of squared differences per metric (AI judges vs humans) ──────────
  const METRIC_KEYS = ['accuracy', 'neutrality', 'completeness', 'conciseness'] as const
  const metricSSD = METRIC_KEYS.map(metric => {
    const ssd = friendlyModels.reduce((sum, model) => {
      const ai = n2(friendlyLlm.find(r => r.model === model && r.metric === metric)?.avg_score)
      const hm = n2(friendlyHuman.find(r => r.model === model && r.metric === metric)?.avg_score)
      return (!isNaN(ai) && !isNaN(hm)) ? sum + (ai - hm) ** 2 : sum
    }, 0)
    return { metric: metric as string, ssd: Math.round(ssd * 1000) / 1000 }
  }).sort((a, b) => b.ssd - a.ssd)

  // ── 2.2 Radar polygon area per model ────────────────────────────────────────
  // 4-axis radar, axes 90° apart → area = ½(r1·r2 + r2·r3 + r3·r4 + r4·r1)
  const radarAreas = radarData
    .map(r => {
      const v = [r.accuracy, r.neutrality, r.completeness, r.conciseness].map(x => x ?? 0)
      const area = 0.5 * v.reduce((sum, val, i) => sum + val * v[(i + 1) % 4], 0)
      return { name: r.name, area: Math.round(area * 100) / 100 }
    })
    .sort((a, b) => b.area - a.area)

  // ── Preferred metrics chart data ────────────────────────────────────────────
  const preferredMetrics = (['accuracy', 'neutrality', 'completeness', 'conciseness'] as const).map(m => {
    const vals = leaderboard.map(r => r[`avg_${m}` as keyof typeof r] as number | null).filter((v): v is number => v != null)
    return { metric: m, avg: vals.length ? vals.reduce((s, v) => s + n2(v), 0) / vals.length : null }
  }).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))

  return (
    <div className="space-y-16 pb-20">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Analysis</h1>
        <p className="mt-1 text-sm text-slate-500">Live data — refresh for latest results</p>
      </div>

      {/* ════ PART 1: AI METACOGNITION ════ */}
      <section className="space-y-8">
        <div className="border-b border-slate-200 pb-2">
          <p className="text-lg font-bold text-slate-700">Part 1 — AI Metacognition</p>
        </div>

        {/* 1.1 Difficulty alignment */}
        <div>
          <SectionHeader n="1.1"
            title="Do AI difficulty ratings align with human ratings?"
            sub="Three AI models score how hard an article is to summarize (1–10). Humans can agree or override." />
          <div className="grid gap-4 sm:grid-cols-3 mb-5">
            <StatCard label="Articles rated"  value={String(diffN)} />
            <StatCard label="Within ±1 point" value={diffAgreeRate != null ? `${diffAgreeRate.toFixed(0)}%` : '—'} sub="rough agreement rate" />
            <StatCard label="Correlation (r)" value={diffR != null ? diffR.toFixed(2) : '—'} sub="Pearson, AI vs human" />
          </div>
          <Card title="AI score vs human score" sub="Each dot is one article. Dots along the diagonal = perfect agreement.">
            <DifficultyScatter data={difficultyData} />
          </Card>
        </div>

        {/* 1.2 LLM-human winner agreement */}
        <div>
          <SectionHeader n="1.2"
            title="Does AI evaluation agree with human summary preference?"
            sub="For each rating, did the AI judges' top-scored summary match what the human actually picked?" />
          <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <AgreementRing total={llmAgreement.total} agreements={llmAgreement.agreements} />
            {llmAgreement.total > 0 && (
              <p className="mt-4 max-w-xs text-center text-sm text-slate-500">
                {llmAgreement.agreements > llmAgreement.total / 2
                  ? 'AI judges tend to agree with human preference.'
                  : 'AI judges often disagree with human preference — humans value something the models miss.'}
              </p>
            )}
          </div>
        </div>

        {/* 1.3 Metric winner gap */}
        <div>
          <SectionHeader n="1.3"
            title="Which metric most separates winners from losers?"
            sub="Average AI judge score on each metric for the human-preferred vs non-preferred summary." />
          <Card title="Preferred vs non-preferred (AI judge scores)">
            <MetricGapChart data={metricGap} />
          </Card>
        </div>

        {/* 1.4 LLM vs human per metric */}
        <div>
          <SectionHeader n="1.4"
            title="Do AI judges and humans agree on model quality?"
            sub="Average score per model per metric — AI judges (indigo) vs human raters (green). One chart per metric." />
          <LlmHumanMetricGrid llm={friendlyLlm} human={friendlyHuman} models={friendlyModels} />
          <div className="mt-5">
            <Card title="Sum of squared differences per metric"
              sub="Σ(AI avg − human avg)² across all models. Lower = better agreement.">
              <MetricSSDChart data={metricSSD} />
            </Card>
          </div>
        </div>
      </section>

      {/* ════ PART 2: HUMAN PREFERENCES ════ */}
      <section className="space-y-8">
        <div className="border-b border-slate-200 pb-2">
          <p className="text-lg font-bold text-slate-700">Part 2 — Human News Summarisation Preferences</p>
        </div>

        {/* 2.1 Model win rates */}
        <div>
          <SectionHeader n="2.1"
            title="Overall model preferences"
            sub="Win rate per model across all completed ratings." />
          <Card title="Win rate by model">
            <ModelWinRateChart data={winRateData} />
          </Card>
        </div>

        {/* 2.2 Model metric profiles */}
        <div>
          <SectionHeader n="2.2"
            title="Model metric profiles"
            sub="Average human scores per model across all four criteria. Wider shape = stronger overall performance." />
          <Card title="Metric radar — all models">
            <ModelRadar data={radarData} />
          </Card>
          <div className="mt-5">
            <Card title="Radar polygon area by model"
              sub="½(r₁·r₂ + r₂·r₃ + r₃·r₄ + r₄·r₁) — larger area = more holistic performance across all four metrics.">
              <RadarAreaRanking data={radarAreas} />
            </Card>
          </div>
        </div>

        {/* 2.3 What makes a good summarizer */}
        <div>
          <SectionHeader n="2.3"
            title="What makes a good summarizer?"
            sub="Average human score per metric for preferred (winning) summaries — ranked highest to lowest." />
          <Card title="Metric scores of preferred summaries" sub="Averaged across all models and ratings">
            <PreferredMetricsChart data={preferredMetrics} />
          </Card>
        </div>
      </section>
    </div>
  )
}
