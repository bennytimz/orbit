import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/research/rss";

describe("feed parsing", () => {
  it("parses RSS 2.0", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example Blog</title>
<item><title>Post one</title><link>https://example.com/1</link><pubDate>Tue, 10 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>Summary <b>one</b></p>]]></description></item>
<item><title>Post two</title><link>https://example.com/2</link></item>
</channel></rss>`);
    expect(feed.title).toBe("Example Blog");
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0].url).toBe("https://example.com/1");
    expect(feed.items[0].title).toBe("Post one");
    expect(feed.items[0].publishedAt).toBe("2026-11-10T08:00:00.000Z");
    expect(feed.items[1].publishedAt).toBeNull();
  });

  it("parses Atom (e.g. GitHub releases)", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Release notes</title>
<entry><title>v2.0.0</title><link rel="alternate" href="https://github.com/o/r/releases/tag/v2.0.0"/><updated>2026-11-01T00:00:00Z</updated><content type="html">Big release</content></entry>
</feed>`);
    expect(feed.title).toBe("Release notes");
    expect(feed.items[0].url).toBe("https://github.com/o/r/releases/tag/v2.0.0");
    expect(feed.items[0].publishedAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("drops items without a usable http(s) link", () => {
    const feed = parseFeed(`<rss><channel><title>t</title><item><title>bad</title><link>javascript:alert(1)</link></item></channel></rss>`);
    expect(feed.items).toHaveLength(0);
  });
});
