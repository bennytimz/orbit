import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpenCheck,
  Check,
  ExternalLink,
  MessageSquareQuote,
  PenLine,
  PlayCircle,
  Radar,
  Send,
  ShieldCheck,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OrbitMark } from "@/components/layout/orbit-mark";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: { absolute: "ORBIT: Everything happening around you. Turned into something worth saying." },
};

const GITHUB_URL = "https://github.com/Bennytimz/orbit";
const VIDEO_ID = "P6GB9BwjOqU";

const STEPS = [
  { icon: Radar, title: "Radar", body: "Paste links, search the web or follow feeds. ORBIT scores each development against your interests and shows why." },
  { icon: BookOpenCheck, title: "Research", body: "A source-backed report with claims, dates and uncertainties. Quoted passages are checked word for word against the source text." },
  { icon: MessageSquareQuote, title: "Your perspective", body: "Answer a few pointed questions by text or voice. Your answers are the only source of opinions in what gets written." },
  { icon: PenLine, title: "Studio", body: "Drafts adapted per platform: a LinkedIn post and an X thread, not one text pasted twice. Edit, version and compare." },
  { icon: ShieldCheck, title: "Guardian checks", body: "Rule checks and an AI review flag unsupported claims, platform limits and voice drift, each with its reasoning." },
  { icon: Send, title: "Buffer", body: "Pick channels, choose draft, queue or a time, approve, and ORBIT creates the real posts in your Buffer account." },
];

const BUFFER_FEATURES = [
  "OAuth 2.0 with PKCE; tokens encrypted and kept server-side",
  "Account, channels and posts GraphQL queries",
  "createPost for drafts, queue and custom-time scheduling",
  "X threads sent as one post via metadata.twitter.thread",
  "Approval enforced on the server, not just in the UI",
  "Per-channel results recorded with their Buffer post IDs",
  "Ambiguous responses marked “unknown” so a retry can’t create a duplicate post",
];

const SCREENS = [
  { src: "/screens/radar.png", alt: "Radar showing a PostgreSQL 18 discovery with its relevance score, source and dates", caption: "Radar: a scored discovery with its source and dates" },
  { src: "/screens/research.png", alt: "Research report with key findings, verified passages and the perspective panel", caption: "Research: claims with word-for-word verified passages" },
  { src: "/screens/studio.png", alt: "Studio editing a three-post X thread with Guardian passed", caption: "Studio: an X thread with per-post limits and Guardian review" },
  { src: "/screens/publish-confirm.png", alt: "Final confirmation dialog before creating a Buffer draft", caption: "Publishing: the final confirmation before anything reaches Buffer" },
];

export default async function Home() {
  if (await getSession()) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-[0.2em]">
          <OrbitMark className="size-7" />
          ORBIT
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Sign in</Link>
          <Link href="/signup" className={buttonVariants()}>Create an account</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-16 pb-12 text-center sm:pt-24">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            ORBIT<span className="text-primary">:</span> Everything happening around you. Turned into something worth saying.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            Turn industry news into source-checked posts in your own voice, published through Buffer.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href="#demo" className={buttonVariants({ size: "lg" })}>
              <PlayCircle /> Watch the demo
            </a>
            <Link href="/signup" className={buttonVariants({ variant: "outline", size: "lg" })}>Create an account</Link>
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>Sign in</Link>
          </div>
        </section>

        <section id="demo" aria-labelledby="demo-title" className="mx-auto max-w-5xl scroll-mt-8 px-6 pb-20">
          <h2 id="demo-title" className="sr-only">Demo video</h2>
          <div className="aspect-video overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/5">
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`}
              title="ORBIT demo video"
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </section>

        <section aria-labelledby="how-title" className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 id="how-title" className="text-2xl font-semibold sm:text-3xl">How it works</h2>
            <p className="mt-2 text-muted-foreground">From a news item to a scheduled post in six steps. You approve every one that reaches Buffer.</p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                    <h3 className="font-medium">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="screens-title" className="mx-auto max-w-6xl px-6 py-20">
          <h2 id="screens-title" className="text-2xl font-semibold sm:text-3xl">The real app</h2>
          <p className="mt-2 text-muted-foreground">Screenshots from a live ORBIT account, not mockups.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {SCREENS.map((s) => (
              <figure key={s.src} className="overflow-hidden rounded-xl border border-border bg-card">
                <Image src={s.src} alt={s.alt} width={1440} height={900} className="h-auto w-full" sizes="(min-width: 768px) 560px, 100vw" />
                <figcaption className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{s.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section aria-labelledby="buffer-title" className="border-t border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 id="buffer-title" className="text-2xl font-semibold sm:text-3xl">Built on the Buffer API</h2>
              <p className="mt-3 text-muted-foreground">
                Publishing goes through Buffer&rsquo;s official GraphQL API. Nothing is simulated: every result you see came back from Buffer.
              </p>
            </div>
            <ul className="space-y-3">
              {BUFFER_FEATURES.map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-relaxed">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Say something worth saying.</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>Create an account</Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>Sign in</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
          <span>Built for Buffer Commit</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
            github.com/Bennytimz/orbit <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </footer>
    </div>
  );
}
