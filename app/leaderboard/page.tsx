import { getLeaderboard } from '@/lib/db'

export const revalidate = 60 // Refresh every 60 seconds

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return Number(n).toFixed(1)
}

export default async function LeaderboardPage() {
  const rows = await getLeaderboard()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#3B82F6]">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aggregate scores across all rated articles. Ratings are collected blind — users don&apos;t
          know which model generated which summary until after submitting.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
          No ratings yet.{' '}
          <a href="/" className="text-indigo-600 hover:underline">
            Be the first to rate a summary.
          </a>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-5 py-3 font-medium text-slate-600">#</th>
                <th className="px-5 py-3 font-medium text-slate-600">Model</th>
                <th className="px-5 py-3 text-center font-medium text-slate-600">Win rate</th>
                <th className="px-5 py-3 text-center font-medium text-slate-600">Accuracy</th>
                <th className="px-5 py-3 text-center font-medium text-slate-600">Neutrality</th>
                <th className="px-5 py-3 text-center font-medium text-slate-600">Completeness</th>
                <th className="px-5 py-3 text-center font-medium text-slate-600">Conciseness</th>
                <th className="px-5 py-3 text-center font-medium text-slate-600">Appearances</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.model}
                  className={i < rows.length - 1 ? 'border-b border-slate-100' : ''}
                >
                  <td className="px-5 py-4 text-slate-400">{i + 1}</td>
                  <td className="px-5 py-4 font-bold text-[#3B82F6]">{row.model}</td>
                  <td className="px-5 py-4 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        Number(row.win_rate_pct) >= 50
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {fmt(row.win_rate_pct)}%
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center text-slate-700">{fmt(row.avg_accuracy)}</td>
                  <td className="px-5 py-4 text-center text-slate-700">{fmt(row.avg_neutrality)}</td>
                  <td className="px-5 py-4 text-center text-slate-700">{fmt(row.avg_completeness)}</td>
                  <td className="px-5 py-4 text-center text-slate-700">{fmt(row.avg_conciseness)}</td>
                  <td className="px-5 py-4 text-center text-slate-400">{row.total_appearances}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
