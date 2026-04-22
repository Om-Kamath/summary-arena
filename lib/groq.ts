import Groq from 'groq-sdk'

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export const MODELS: { id: string; name: string }[] = [
  { id: 'llama-3.3-70b-versatile',                    name: 'Llama 3.3 70B'       },
  { id: 'llama-3.1-8b-instant',                       name: 'Llama 3.1 8B'        },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct',  name: 'Llama 4 Scout 17B'   },
  //{ id: 'moonshotai/kimi-k2-instruct',                name: 'Kimi K2'             },
  { id: 'openai/gpt-oss-20b',                         name: 'GPT-OSS 20B'         },
  { id: 'qwen/qwen3-32b',                             name: 'Qwen3 32B'           },
]

/** Pick two distinct models at random for a session. */
export function pickTwoModels(): [{ id: string; name: string }, { id: string; name: string }] {
  const shuffled = [...MODELS].sort(() => Math.random() - 0.5)
  return [shuffled[0], shuffled[1]]
}

/** Pick three distinct models at random (difficulty / LLM judges). */
export function pickThreeModels(): [typeof MODELS[0], typeof MODELS[0], typeof MODELS[0]] {
  if (MODELS.length < 3) {
    throw new Error('MODELS must contain at least three entries for pickThreeModels')
  }
  const shuffled = [...MODELS].sort(() => Math.random() - 0.5)
  return [shuffled[0], shuffled[1], shuffled[2]]
}

const ARTICLE_SNIPPET = (text: string) => text.slice(0, 4000)

export const EVAL_METRIC_KEYS = ['accuracy', 'neutrality', 'completeness', 'conciseness'] as const
export type EvalMetricKey = (typeof EVAL_METRIC_KEYS)[number]

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function stripReasoning(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  text = text.split(/<\/think>/i).at(-1)?.trim() ?? text
  text = text.split(/<think>/i)[0]?.trim() ?? text
  text = text.replace(/<\/?think>/gi, '').trim()
  return text
}

const DIFFICULTY_PROMPT = (article: string) => `\
You rate how difficult it would be for a skilled human to produce an accurate, neutral 3–4 sentence summary of the news article below.
Consider: information density, ambiguity, jargon, length, and cross-references.

Respond with ONLY a JSON object in this exact shape (no markdown, no prose):
{"score": <integer from 1 to 10>}

Article:
${ARTICLE_SNIPPET(article)}
`

/** Single-model difficulty score 1–10 for summarizing this article. */
export async function rateSummarizationDifficulty(articleText: string, model: string): Promise<number> {
  const res = await groq.chat.completions.create({
    model,
    messages: [{ role: 'user', content: DIFFICULTY_PROMPT(articleText) }],
    max_tokens: 80,
    temperature: 0.2,
  })
  const raw = res.choices[0].message.content?.trim() ?? ''
  const obj = parseJsonObject(raw)
  const s = obj?.score
  if (typeof s === 'number' && Number.isFinite(s)) return clampInt(s, 1, 10)
  if (typeof s === 'string' && /^\d+$/.test(s)) return clampInt(Number(s), 1, 10)
  return clampInt(5, 1, 10)
}

const BOTH_SUMMARIES_METRICS_PROMPT = (
  article: string,
  summaryAId: string,
  summaryAText: string,
  summaryBId: string,
  summaryBText: string
) => `\
You are evaluating two short news summaries against the original article.

Article:
${ARTICLE_SNIPPET(article)}

Summary (id ${summaryAId}):
${summaryAText.slice(0, 2000)}

Summary (id ${summaryBId}):
${summaryBText.slice(0, 2000)}

For EACH summary, assign an integer score from 1 (poor) to 5 (excellent) on:
- accuracy: factual alignment with the article
- neutrality: objective tone, minimal bias
- completeness: key points covered
- conciseness: appropriate brevity without omitting essentials

Respond with ONLY valid JSON (no markdown). Use the summary UUIDs as keys exactly as given:
{"scores":{"${summaryAId}":{"accuracy":1,"neutrality":1,"completeness":1,"conciseness":1},"${summaryBId}":{"accuracy":1,"neutrality":1,"completeness":1,"conciseness":1}}}
Replace the placeholder 1s with your real scores (integers 1–5).
`

export type SummaryMetricScores = Record<EvalMetricKey, number>

/** One judge scores both summaries on all four metrics in one completion. */
export async function evaluateBothSummariesMetrics(
  articleText: string,
  summaryAId: string,
  summaryAText: string,
  summaryBId: string,
  summaryBText: string,
  model: string
): Promise<{ [summaryId: string]: SummaryMetricScores }> {
  const res = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: BOTH_SUMMARIES_METRICS_PROMPT(
          articleText,
          summaryAId,
          summaryAText,
          summaryBId,
          summaryBText
        ),
      },
    ],
    max_tokens: 400,
    temperature: 0.2,
  })
  const raw = res.choices[0].message.content?.trim() ?? ''
  const obj = parseJsonObject(raw)
  const scores = obj?.scores as Record<string, unknown> | undefined
  const empty = (): SummaryMetricScores => ({
    accuracy: 3,
    neutrality: 3,
    completeness: 3,
    conciseness: 3,
  })
  const parseBlock = (block: unknown): SummaryMetricScores => {
    if (!block || typeof block !== 'object') return empty()
    const o = block as Record<string, unknown>
    const out = empty()
    for (const k of EVAL_METRIC_KEYS) {
      const v = o[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampInt(v, 1, 5)
      else if (typeof v === 'string' && /^\d+$/.test(v)) out[k] = clampInt(Number(v), 1, 5)
    }
    return out
  }
  if (!scores || typeof scores !== 'object') {
    return { [summaryAId]: empty(), [summaryBId]: empty() }
  }
  return {
    [summaryAId]: parseBlock(scores[summaryAId]),
    [summaryBId]: parseBlock(scores[summaryBId]),
  }
}

const PROMPT = (content: string) => `\
You are a precise news article summarizer. Write a concise, accurate summary of the article below in 3–4 sentences.

Rules:
- Return only the final summary. Do not include reasoning, analysis, drafts, or <think> tags.
- Include only facts present in the article — no external knowledge
- Maintain a neutral, objective tone
- Cover the main event, key people/entities involved, and why it matters
- Do not start with "This article..." or "The article..."

Article:
${ARTICLE_SNIPPET(content)}

Summary:`

async function requestSummary(content: string, model: string): Promise<string> {
  const res = await groq.chat.completions.create({
    model,
    messages: [{ role: 'user', content: PROMPT(content) }],
    max_tokens: 300,
    temperature: 0.3,
  })
  return res.choices[0].message.content?.trim() ?? ''
}

export async function generateSummary(content: string, model: string): Promise<string> {
  const raw = await requestSummary(content, model)
  const cleaned = stripReasoning(raw)
  if (cleaned && !/<\/?think>/i.test(cleaned)) return cleaned

  const retryRaw = await requestSummary(content, model)
  const retryCleaned = stripReasoning(retryRaw)
  if (retryCleaned && !/<\/?think>/i.test(retryCleaned)) return retryCleaned
  throw new Error('Model returned hidden reasoning instead of a summary')
}
