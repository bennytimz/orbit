import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, parseKey, safeEqual } from "@/lib/security/crypto";
import { isPrivateAddress, robotsAllows } from "@/lib/research/safe-fetch";
import { normalizeForMatch, passageAppearsIn } from "@/lib/research/extract";

const key = randomBytes(32);

describe("token encryption (AES-256-GCM)", () => {
  it("round-trips", () => {
    const sealed = encrypt("secret-token", key, "orbit:buffer:user-1:access");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("secret-token");
    expect(decrypt(sealed, key, "orbit:buffer:user-1:access")).toBe("secret-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const sealed = encrypt("secret-token", key);
    const parts = sealed.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 0xff;
    parts[3] = ct.toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
  });

  it("binds ciphertext to its AAD (another user's token cannot be swapped in)", () => {
    const sealed = encrypt("secret-token", key, "orbit:buffer:user-1:access");
    expect(() => decrypt(sealed, key, "orbit:buffer:user-2:access")).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("x", key), randomBytes(32))).toThrow();
  });

  it("validates key length and encoding", () => {
    expect(parseKey(key.toString("base64")).equals(key)).toBe(true);
    expect(parseKey(key.toString("hex")).equals(key)).toBe(true);
    expect(() => parseKey("too-short")).toThrow(/32 bytes/);
    expect(() => parseKey(undefined)).toThrow(/not configured/);
  });

  it("compares in constant time and handles length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("SSRF protection", () => {
  it.each(["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("robots.txt", () => {
  const robots = `
User-agent: *
Disallow: /private/
Allow: /private/public-note
Disallow: /drafts

User-agent: BadBot
Disallow: /
`;
  it("applies the wildcard group with longest-match precedence", () => {
    expect(robotsAllows(robots, "/blog/post")).toBe(true);
    expect(robotsAllows(robots, "/private/x")).toBe(false);
    expect(robotsAllows(robots, "/private/public-note")).toBe(true);
    expect(robotsAllows(robots, "/drafts/1")).toBe(false);
  });

  it("allows everything when no group applies", () => {
    expect(robotsAllows("User-agent: BadBot\nDisallow: /", "/x")).toBe(true);
    expect(robotsAllows("", "/x")).toBe(true);
  });

  it("honours a full disallow", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /", "/anything")).toBe(false);
  });
});

describe("passage verification", () => {
  const source = "The company said on Tuesday that “revenue rose sharply” — driven by   enterprise demand.";
  it("matches despite quote, dash and whitespace differences", () => {
    expect(passageAppearsIn('"revenue rose sharply" - driven by enterprise demand', [source])).toBe(true);
  });

  it("rejects passages not in the source", () => {
    expect(passageAppearsIn("revenue fell sharply in the quarter", [source])).toBe(false);
  });

  it("rejects passages too short to be meaningful", () => {
    expect(passageAppearsIn("revenue", [source])).toBe(false);
  });

  it("normalises text", () => {
    expect(normalizeForMatch("  A’s  “B” — C ")).toBe("a's \"b\" - c");
  });
});
