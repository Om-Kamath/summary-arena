const HN = 'https://hacker-news.firebaseio.com/v0'

interface HNStory {
  id: number
  type: string
  title: string
  url?: string
  text?: string
  dead?: boolean
  deleted?: boolean
}

export async function fetchRandomStory(): Promise<HNStory> {
  const res = await fetch(`${HN}/topstories.json`, { next: { revalidate: 300 } })
  const ids: number[] = await res.json()

  // Shuffle the top 60 candidates
  const pool = ids.slice(0, 60).sort(() => Math.random() - 0.5)

  for (const id of pool) {
    const story: HNStory = await fetch(`${HN}/item/${id}.json`).then(r => r.json())

    if (!story || story.dead || story.deleted) continue
    if (story.type !== 'story') continue
    if (!story.url && !story.text) continue
    if (story.url?.endsWith('.pdf')) continue

    return story
  }

  throw new Error('Could not find a suitable HN story after sampling 60 candidates')
}
