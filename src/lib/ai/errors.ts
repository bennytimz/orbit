export type AIErrorCode =
  | "not_configured"
  | "rate_limited"
  | "provider_unavailable"
  | "refused"
  | "truncated"
  | "invalid_output"
  | "bad_request"
  | "auth_failed"
  | "web_search_unavailable";

/** Error raised by the AI service layer, carrying a user-safe message. */
export class AIServiceError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    public readonly userMessage: string,
    detail?: string,
  ) {
    super(detail ?? userMessage);
    this.name = "AIServiceError";
  }
}
