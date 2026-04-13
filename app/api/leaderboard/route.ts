import { NextResponse } from 'next/server'
import { getLeaderboard } from '@/lib/db'

export async function GET() {
  try {
    const rows = await getLeaderboard()
    return NextResponse.json({ leaderboard: rows })
  } catch (err) {
    console.error('[/api/leaderboard]', err)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
