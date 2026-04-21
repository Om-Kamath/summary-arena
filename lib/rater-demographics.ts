/** Stored on `ratings` — keep in sync with API validation and UI. */

export const EDUCATION_OPTIONS = [
  { value: 'high_school', label: 'High school' },
  { value: 'undergrad', label: 'Undergraduate' },
  { value: 'masters', label: "Master's" },
  { value: 'phd', label: 'PhD' },
  { value: 'other', label: 'Other' },
] as const

export const STUDY_FIELD_OPTIONS = [
  { value: 'computer_science', label: 'Computer Science' },
  { value: 'operations_research', label: 'Operations research' },
  { value: 'data_science', label: 'Data science' },
  { value: 'health_tech', label: 'Health tech' },
  { value: 'urban_design', label: 'Urban design' },
  { value: 'political_science', label: 'Political science' },
  { value: 'media_journalism', label: 'Media and journalism studies' },
  { value: 'economics', label: 'Economics' },
  { value: 'business', label: 'Business' },
] as const

export const NEWS_FREQUENCY_OPTIONS = [
  { value: 'multiple_daily', label: 'Multiple times per day' },
  { value: 'once_daily', label: 'About once a day' },
  { value: 'every_few_days', label: 'Once every few days' },
  { value: 'once_week', label: 'About once a week' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'never', label: 'Never' },
] as const

export type EducationValue = (typeof EDUCATION_OPTIONS)[number]['value']
export type StudyFieldValue = (typeof STUDY_FIELD_OPTIONS)[number]['value']
export type NewsFrequencyValue = (typeof NEWS_FREQUENCY_OPTIONS)[number]['value']

const EDU_SET = new Set<string>(EDUCATION_OPTIONS.map(o => o.value))
const STUDY_SET = new Set<string>(STUDY_FIELD_OPTIONS.map(o => o.value))
const NEWS_SET = new Set<string>(NEWS_FREQUENCY_OPTIONS.map(o => o.value))

export function isValidEducation(v: unknown): v is EducationValue {
  return typeof v === 'string' && EDU_SET.has(v)
}

export function isValidStudyField(v: unknown): v is StudyFieldValue {
  return typeof v === 'string' && STUDY_SET.has(v)
}

export function isValidNewsFrequency(v: unknown): v is NewsFrequencyValue {
  return typeof v === 'string' && NEWS_SET.has(v)
}
