/**
 * Plain (non-"use client") module so server components such as the Memory page
 * can read these values. Importing a non-component export from a "use client"
 * file in a server component yields a client reference, not the array.
 */
export const VOICE_FIELDS = [
  ["tone", "Tone", "e.g. Direct, calm, quietly confident"],
  ["formality", "Formality", "e.g. Professional but conversational"],
  ["personality", "Personality", "e.g. Curious, skeptical of hype"],
  ["vocabulary", "Vocabulary", "e.g. Plain English, technical terms explained"],
  ["sentence_length", "Sentence length", "e.g. Short sentences, occasional long one for nuance"],
  ["humor", "Humor", "e.g. Dry, rare"],
  ["technical_depth", "Technical depth", "e.g. Deep for engineers, light for executives"],
] as const;
