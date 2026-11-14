import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches public web resources on behalf of a user with guardrails:
 * http(s) only, no private/loopback/link-local targets (SSRF protection),
 * manual redirect handling with re-validation, timeouts and size limits.
 */

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

const USER_AGENT = "ORBIT-Research/0.1 (+content research assistant; respects robots.txt)";
const MAX_BYTES = 2_000_000;

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Only http and https URLs are supported.");
  if (url.username || url.password) throw new FetchBlockedError("URLs with embedded credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new FetchBlockedError("Private network addresses are not allowed.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new FetchBlockedError("The host could not be resolved.");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new FetchBlockedError("Private network addresses are not allowed.");
  return url;
}

export interface FetchedResource {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

export async function safeFetch(raw: string, opts: { timeoutMs?: number; accept?: string } = {}): Promise<FetchedResource> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, url).toString();
        continue;
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BYTES) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
      return { finalUrl: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("The source took too long to respond.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchBlockedError("Too many redirects.");
}

/** Minimal robots.txt check for the ORBIT user agent and `*`. */
export async function isAllowedByRobots(raw: string): Promise<boolean> {
  try {
    const url = new URL(raw);
    const res = await safeFetch(`${url.origin}/robots.txt`, { timeoutMs: 5000, accept: "text/plain" });
    if (res.status >= 400) return true;
    return robotsAllows(res.body, url.pathname);
  } catch {
    return true; // robots.txt unreachable: treat as no restrictions
  }
}

export function robotsAllows(robots: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && "orbit-research".includes(a)));
  const group = specific ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    const pattern = rule.path.replace(/\*$/, "");
    if (path.startsWith(pattern.replace(/\$$/, "")) && (!best || pattern.length > best.length)) {
      best = { allow: rule.allow, length: pattern.length };
    }
  }
  return best ? best.allow : true;
}
