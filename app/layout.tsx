import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Summary Arena',
  description: 'Rate AI-generated news summaries and see which models perform best.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="bg-white">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="flex items-start justify-between">
              {/*logo*/}
              <a href="/" className='flex-shrink-0'>
                <img
                  src="/summaryarenalogo.png"
                  alt="Summary Arena"
                  className="h-16"
                  />
              </a>
              {/* right side leaderboard link*/}
              <div className="flex items-start gap-8">
                <div className="text-right text-sm">
                  <p style={{ color: '#3B82F6' }} className="font-medium leading-tight max-w-xs">
                    Compare and vote on AI-generated news summaries based on trust, accuracy, personality, and conciseness.
                  </p>
                </div>
                <a
                  href="/leaderboard"
                  className="flex items-center gap-2 whitespace-nowrap text-lg font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  <img
                  src="/summaryarenaleaderboard.png"
                  alt="Summary Arena Leaderboard"
                  className="h-16"
                  />
                </a>
              </div>
            </div>
          </div>
        </header>
        <main style={{ color: '#3B82F6' }} className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mt-16 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          Powered by Groq &amp; Hacker News
        </footer>
      </body>
    </html>
  )
}
