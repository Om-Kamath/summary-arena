import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Summary Arena',
  description: 'Rate AI-generated news summaries and see which models perform best.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-indigo-600">Summary Arena</span>
            </a>
            <a
              href="/leaderboard"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
            >
              Leaderboard
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          Powered by Groq &amp; Hacker News
        </footer>
      </body>
    </html>
  )
}
