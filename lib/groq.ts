import Groq from 'groq-sdk'

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export const MODELS: { id: string; name: string }[] = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
  { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B'  },
  { id: 'gemma2-9b-it',            name: 'Gemma 2 9B'    },
  { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B'  },
]

/** Pick two distinct models at random for a session. */
export function pickTwoModels(): [{ id: string; name: string }, { id: string; name: string }] {
  const shuffled = [...MODELS].sort(() => Math.random() - 0.5)
  return [shuffled[0], shuffled[1]]
}

const PROMPT = (content: string) => `\
You are a precise news article summarizer. Write a concise, accurate summary of the article below in 3–4 sentences.

Rules:
- Include only facts present in the article — no external knowledge
- Maintain a neutral, objective tone
- Cover the main event, key people/entities involved, and why it matters
- Do not start with "This article..." or "The article..."

Article:
${content.slice(0, 4000)}

Summary:`

export async function generateSummary(content: string, model: string): Promise<string> {
  const res = await groq.chat.completions.create({
    model,
    messages: [{ role: 'user', content: PROMPT(content) }],
    max_tokens: 300,
    temperature: 0.3,
  })
  return res.choices[0].message.content?.trim() ?? ''
}
