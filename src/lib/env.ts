import "server-only";

/**
 * Server-side environment access. Optional integrations never prevent the app
 * from starting; instead each feature checks `integrations()` and explains the
 * limitation to the user when something is not configured.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export class ConfigurationError extends Error {
  constructor(
    public readonly variable: string,
    message?: string,
  ) {
    super(message ?? `${variable} is not configured on the server.`);
    this.name = "ConfigurationError";
  }
}

export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new ConfigurationError(name);
  return value;
}

export function appUrl(): string {
  return (read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
}

export function supabaseConfig() {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

/** Free-tier Gemini Flash model; override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export function aiModel(): string {
  return read("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
}

export function bufferOAuthConfig() {
  return {
    clientId: requireEnv("BUFFER_CLIENT_ID"),
    clientSecret: read("BUFFER_CLIENT_SECRET"),
    redirectUri: read("BUFFER_REDIRECT_URI") ?? `${appUrl()}/api/buffer/callback`,
  };
}

export function transcriptionConfig() {
  const key = read("TRANSCRIPTION_API_KEY");
  if (!key) return null;
  return { provider: (read("TRANSCRIPTION_PROVIDER") ?? "deepgram") as "deepgram", apiKey: key };
}

export interface IntegrationStatus {
  supabase: boolean;
  serviceRole: boolean;
  /** AI provider (Gemini) configured. */
  ai: boolean;
  aiProvider: string;
  aiModel: string;
  /** Whether the AI provider offers web search discovery. */
  webSearch: boolean;
  bufferOAuth: boolean;
  bufferEncryption: boolean;
  transcription: boolean;
  transcriptionProvider: string | null;
}

export function integrations(): IntegrationStatus {
  return {
    supabase: Boolean(read("NEXT_PUBLIC_SUPABASE_URL") && read("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
    serviceRole: Boolean(read("SUPABASE_SERVICE_ROLE_KEY")),
    ai: Boolean(read("GEMINI_API_KEY")),
    aiProvider: "Google Gemini",
    aiModel: aiModel(),
    webSearch: false,
    bufferOAuth: Boolean(read("BUFFER_CLIENT_ID")),
    bufferEncryption: Boolean(read("BUFFER_TOKEN_ENCRYPTION_KEY")),
    transcription: Boolean(read("TRANSCRIPTION_API_KEY")),
    transcriptionProvider: read("TRANSCRIPTION_API_KEY") ? (read("TRANSCRIPTION_PROVIDER") ?? "deepgram") : null,
  };
}
