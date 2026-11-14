import { describe, expect, it } from "vitest";
import { countCharacters, countEmoji, countHashtags, platformForService, publishableText } from "@/engines/studio/platforms";
import { hostname, titleCase, utcToZonedLocal, zonedLocalToUtc } from "@/lib/format";

describe("platform character counting", () => {
  it("counts X links as 23 characters", () => {
    const text = "Read this https://example.com/a/very/long/path/that/would/otherwise/count/fully";
    expect(countCharacters(text, "x")).toBe("Read this ".length + 23);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(countCharacters("😀😀", "linkedin")).toBe(2);
  });

  it("counts graphemes on Bluesky", () => {
    expect(countCharacters("👩‍💻", "bluesky")).toBe(1);
  });

  it("counts hashtags and emoji", () => {
    expect(countHashtags("#one two #three#not")).toBe(2);
    expect(countEmoji("ok 🚀 then 🔥")).toBe(2);
  });

  it("maps Buffer services to platforms", () => {
    expect(platformForService("linkedin")).toBe("linkedin");
    expect(platformForService("twitter")).toBe("x");
    expect(platformForService("unknown-network")).toBeNull();
  });

  it("sends only the first thread part", () => {
    expect(publishableText("a\n\nb", ["a", "b"])).toBe("a");
    expect(publishableText("body", null)).toBe("body");
  });
});

describe("timezone conversion", () => {
  it("converts wall-clock time in a zone to UTC", () => {
    expect(zonedLocalToUtc("2026-11-20T09:30", "America/New_York")).toBe("2026-11-20T14:30:00.000Z");
    expect(zonedLocalToUtc("2026-07-20T09:30", "America/New_York")).toBe("2026-07-20T13:30:00.000Z");
    expect(zonedLocalToUtc("2026-11-20T09:30", "Africa/Lagos")).toBe("2026-11-20T08:30:00.000Z");
    expect(zonedLocalToUtc("2026-11-20T09:30", "UTC")).toBe("2026-11-20T09:30:00.000Z");
  });

  it("round-trips through utcToZonedLocal", () => {
    for (const tz of ["Asia/Kolkata", "Europe/London", "Pacific/Auckland", "America/Los_Angeles"]) {
      const local = "2026-03-15T18:45";
      expect(utcToZonedLocal(zonedLocalToUtc(local, tz)!, tz)).toBe(local);
    }
  });

  it("rejects malformed input", () => {
    expect(zonedLocalToUtc("tomorrow", "UTC")).toBeNull();
  });

  it("formats helpers", () => {
    expect(titleCase("add_to_queue")).toBe("Add To Queue");
    expect(hostname("https://www.example.com/x")).toBe("example.com");
  });
});
