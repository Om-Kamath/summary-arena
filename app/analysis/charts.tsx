'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell,
} from 'recharts'

// ── Shared constants ──────────────────────────────────────────────────────────

export const PALETTE = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']
const METRICS = ['accuracy', 'neutrality', 'completeness', 'conciseness']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const n2  = (v: unknown): number => (v == null ? NaN : Number(v))
const safe = (v: unknown) => { const n = n2(v); return isNaN(n) ? null : n }

const TT: React.CSSProperties = {
  backgroundColor: 'white', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '12px', padding: '8px 12px',
  boxShadow: '0 2px 8px rgb(0 0 0 / 0.08)',
}

function Empty() {
  return (
    <div className="flex h-44 items-center justify-center text-sm text-slate-400">
      Not enough data yet
    </div>
  )
}

// ── Agreement ring (SVG, no recharts needed) ─────────────────────────────────

export function AgreementRing({ total, agreements }: { total: number; agreements: number }) {
  if (total === 0) return <Empty />
  const pct = (agreements / total) * 100
  const r   = 38
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)
  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={55} cy={55} r={r} fill="none" stroke="#f1f5f9" strokeWidth={12} />
        <circle
          cx={55} cy={55} r={r} fill="none" stroke="#6366f1" strokeWidth={12}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 55 55)"
        />
        <text x={55} y={52} textAnchor="middle" fontSize={20} fontWeight="700" fill="#1e293b">
          {pct.toFixed(0)}%
        </text>
        <text x={55} y={68} textAnchor="middle" fontSize={10} fill="#94a3b8">
          agreed
        </text>
      </svg>
      <p className="text-xs text-slate-500">{agreements} of {total} ratings matched</p>
    </div>
  )
}

// ── Difficulty scatter ────────────────────────────────────────────────────────

export function DifficultyScatter({ data }: {
  data: { llm_score: unknown; human_score: unknown }[]
}) {
  const pts = data
    .map(d => ({ x: n2(d.llm_score), y: n2(d.human_score) }))
    .filter(d => !isNaN(d.x) && !isNaN(d.y))
  if (pts.length === 0) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="x" type="number" domain={[0, 10]} name="AI score"
          label={{ value: 'AI score (1–10)', position: 'insideBottom', offset: -14, fontSize: 11, fill: '#94a3b8' }}
          tick={{ fontSize: 11 }} />
        <YAxis dataKey="y" type="number" domain={[0, 10]} name="Human score"
          label={{ value: 'Human score', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: '#94a3b8' }}
          tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={TT}
          formatter={(v: unknown) => (v as number)?.toFixed(1)}
          labelFormatter={() => ''} />
        <Scatter data={pts} fill="#6366f1" fillOpacity={0.7} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ── Metric winner gap (horizontal bars) ──────────────────────────────────────

export function MetricGapChart({ data }: {
  data: { metric: string; winner_avg: unknown; loser_avg: unknown }[]
}) {
  const rows = data.map(r => ({
    name: cap(r.metric),
    Preferred:       safe(r.winner_avg),
    'Non-preferred': safe(r.loser_avg),
  }))
  if (!rows.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, left: 90, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={88} />
        <Tooltip contentStyle={TT} formatter={(v: unknown) => (v as number)?.toFixed(2)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Preferred"       fill="#6366f1" radius={[0, 4, 4, 0]} barSize={13} />
        <Bar dataKey="Non-preferred"   fill="#cbd5e1" radius={[0, 4, 4, 0]} barSize={13} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── LLM vs Human per metric — 2×2 small multiples ────────────────────────────

export function LlmHumanMetricGrid({ llm, human, models }: {
  llm:    { model: string; metric: string; avg_score: unknown }[]
  human:  { model: string; metric: string; avg_score: unknown }[]
  models: string[]   // already friendly names
}) {
  if (!models.length) return <Empty />
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {METRICS.map(metric => {
        const rows = models.map(m => ({
          name: m,
          'AI judges': safe(llm.find(r  => r.model === m && r.metric === metric)?.avg_score),
          'Humans':    safe(human.find(r => r.model === m && r.metric === metric)?.avg_score),
        }))
        return (
          <div key={metric} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {cap(metric)}
            </p>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 55, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={TT} formatter={(v: unknown) => (v as number)?.toFixed(2)} />
                <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="top" />
                <Bar dataKey="AI judges" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={12} />
                <Bar dataKey="Humans"    fill="#10b981" radius={[3, 3, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}

// ── Model win rates (horizontal bar) ─────────────────────────────────────────

export function ModelWinRateChart({ data }: {
  data: { name: string; winRate: number; wins: number; appearances: number }[]
}) {
  if (!data.length) return <Empty />
  const sorted = [...data].sort((a, b) => b.winRate - a.winRate)
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 52)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 60, left: 120, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={118} />
        <Tooltip contentStyle={TT}
          formatter={(v: unknown, _k: unknown, p: unknown) => {
            const pld = (p as { payload: { wins: number; appearances: number } }).payload
            return [`${(v as number).toFixed(1)}% (${pld.wins}/${pld.appearances})`, 'Win rate']
          }} />
        <Bar dataKey="winRate" radius={[0, 5, 5, 0]} barSize={22}
          label={{ position: 'right', formatter: (v: unknown) => `${(v as number).toFixed(0)}%`, fontSize: 12, fill: '#64748b' }}>
          {sorted.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Model metric radar ────────────────────────────────────────────────────────

export function ModelRadar({ data }: {
  data: { name: string; accuracy: number | null; neutrality: number | null; completeness: number | null; conciseness: number | null }[]
}) {
  if (!data.length) return <Empty />
  const radarData = METRICS.map(m => {
    const entry: Record<string, string | number | null> = { metric: cap(m) }
    data.forEach(r => { entry[r.name] = r[m as keyof typeof r] as number | null })
    return entry
  })
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: '#64748b' }} />
        <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9 }} tickCount={6} />
        {data.map((r, i) => (
          <Radar key={r.name} name={r.name} dataKey={r.name}
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.12} strokeWidth={2} dot />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip contentStyle={TT} formatter={(v: unknown) => (v as number)?.toFixed ? (v as number).toFixed(2) : String(v)} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Education × model grouped bar ────────────────────────────────────────────

export function EducationPrefsChart({ chartData, models }: {
  chartData: Record<string, string | number | null>[]   // [{ name, modelA, modelB, ... }]
  models:    string[]
}) {
  if (!chartData.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 56, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip contentStyle={TT} formatter={(v: unknown) => [`${(v as number)?.toFixed(1)}%`, '']} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {models.map((m, i) => (
          <Bar key={m} dataKey={m} fill={PALETTE[i % PALETTE.length]}
            radius={[3, 3, 0, 0]} barSize={14} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Preferred summary metric averages ────────────────────────────────────────

export function PreferredMetricsChart({ data }: {
  data: { metric: string; avg: number | null }[]
}) {
  const rows = data.map(d => ({ name: cap(d.metric), Score: safe(d.avg) }))
  if (!rows.length) return <Empty />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 60, left: 100, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={98} />
        <Tooltip contentStyle={TT} formatter={(v: unknown) => [(v as number)?.toFixed(2), 'Avg score']} />
        <Bar dataKey="Score" radius={[0, 5, 5, 0]} barSize={20}
          label={{ position: 'right', formatter: (v: unknown) => (v as number)?.toFixed(2), fontSize: 12, fill: '#64748b' }}>
          {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
