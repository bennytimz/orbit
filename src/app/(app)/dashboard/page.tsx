import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, FolderKanban, Lightbulb, Mic, PenLine, Radar, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { getConnection } from "@/lib/buffer/credentials";
import { GuardianPill, Notice, OperationPill, Pill, SeverityPill } from "@/components/shared";
import { CATEGORY_LABELS } from "@/components/radar/labels";
import { PLATFORMS } from "@/engines/studio/platforms";
import { OBJECTIVE_LABELS } from "@/engines/campaign/phases";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Campaign, ContentAsset, Discovery, GuardianIssue, BufferPublication } from "@/types/domain";

export const metadata: Metadata = { title: "Command Center" };

function Card({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {linkLabel ?? "View all"} <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export default async function DashboardPage() {
  const { supabase, userId } = await requireUser();
  const s = integrations();
  const nowIso = new Date().toISOString();
  const head = { count: "exact" as const, head: true };

  const [{ data: profile }, { data: discoveries }, { data: campaigns }, { data: issues }, { data: upcoming }, { data: recentContent }, connection, pipeline] = await Promise.all([
    supabase.from("profiles").select("full_name, timezone, industry").eq("user_id", userId).single(),
    supabase.from("discoveries").select("id, title, category, relevance_score, why_it_matters, discovered_at, status").eq("user_id", userId).in("status", ["new", "saved"]).order("relevance_score", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false }).limit(5),
    supabase.from("campaigns").select("id, name, objective, status, start_date, end_date").eq("user_id", userId).in("status", ["planning", "active"]).order("updated_at", { ascending: false }).limit(4),
    supabase.from("guardian_issues").select("id, title, severity, content_asset_id").eq("user_id", userId).eq("review_status", "open").in("severity", ["blocking", "warning"]).order("created_at", { ascending: false }).limit(5),
    supabase.from("buffer_publications").select("id, channel_name, text_sent, due_at, mode, operation_status, buffer_status, content_asset_id").eq("user_id", userId).eq("operation_status", "succeeded").gte("due_at", nowIso).order("due_at").limit(6),
    supabase.from("content_assets").select("id, title, platform, status, guardian_status, updated_at").eq("user_id", userId).in("status", ["draft", "in_review", "approved"]).order("updated_at", { ascending: false }).limit(5),
    s.serviceRole ? getConnection(userId).catch(() => null) : Promise.resolve(null),
    Promise.all([
      count(supabase.from("discoveries").select("id", head).eq("user_id", userId).in("status", ["new", "saved"])),
      count(supabase.from("research_reports").select("id", head).eq("user_id", userId)),
      count(supabase.from("content_assets").select("id", head).eq("user_id", userId).eq("status", "idea")),
      count(supabase.from("content_assets").select("id", head).eq("user_id", userId).eq("status", "draft")),
      count(supabase.from("content_assets").select("id", head).eq("user_id", userId).in("status", ["in_review", "approved"])),
      count(supabase.from("content_assets").select("id", head).eq("user_id", userId).eq("status", "scheduled")),
      count(supabase.from("content_assets").select("id", head).eq("user_id", userId).eq("status", "published")),
      count(supabase.from("guardian_issues").select("id", head).eq("user_id", userId).eq("review_status", "open").eq("severity", "blocking")),
    ]),
  ]);
  const tz = (profile?.timezone as string) ?? "UTC";
  const name = (profile?.full_name as string | null)?.split(" ")[0];
  const [newDiscoveries, reports, ideas, drafts, review, scheduled, published, blocking] = pipeline;
  const stages = [
    { label: "Discoveries", value: newDiscoveries, href: "/radar" },
    { label: "Research", value: reports, href: "/research" },
    { label: "Ideas", value: ideas, href: "/studio?status=idea" },
    { label: "Drafts", value: drafts, href: "/studio?status=draft" },
    { label: "Review / approved", value: review, href: "/studio?status=in_review" },
    { label: "Scheduled", value: scheduled, href: "/studio?status=scheduled" },
    { label: "Published", value: published, href: "/studio?status=published" },
  ];
  const quick = [
    { label: "Discover", href: "/radar", icon: Radar },
    { label: "Research", href: "/research", icon: BookOpenText },
    { label: "Capture an idea", href: "/studio/new?start=idea", icon: Lightbulb },
    { label: "Record a voice note", href: "/studio/new?start=idea", icon: Mic },
    { label: "Create content", href: "/studio/new", icon: PenLine },
    { label: "Build a campaign", href: "/campaigns", icon: FolderKanban },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{name ? `Welcome back, ${name}.` : "Welcome to ORBIT."}</h1>
        <p className="mt-1 text-sm text-muted-foreground">What&apos;s happening{profile?.industry ? ` in ${profile.industry}` : ""}, what&apos;s ready, and what needs you.</p>
      </div>

      {!s.ai || !connection ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {!s.ai ? <Notice tone="warning" title="AI is not configured">Set GEMINI_API_KEY to enable research analysis, drafting and Guardian AI review.</Notice> : null}
          {!connection ? (
            <Notice title="Buffer not connected">
              <Link href="/publishing" className="text-primary hover:underline">Connect Buffer</Link> to schedule and publish approved content.
            </Notice>
          ) : null}
        </div>
      ) : null}

      <nav className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Quick actions">
        {quick.map((q) => (
          <Link key={q.label} href={q.href} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-sm transition-colors hover:border-primary/40">
            <q.icon className="size-4 text-primary" /> {q.label}
          </Link>
        ))}
      </nav>

      <section className="mb-6 rounded-xl border border-border bg-card p-5" aria-label="Content pipeline">
        <h2 className="mb-3 text-sm font-semibold">Content pipeline</h2>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {stages.map((st, i) => (
            <li key={st.label}>
              <Link href={st.href} className="block rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40">
                <span className="block font-mono text-xl tabular-nums">{st.value}</span>
                <span className="text-xs text-muted-foreground">
                  {i + 1}. {st.label}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Radar — top opportunities" href="/radar">
          {(discoveries ?? []).length ? (
            <ul className="space-y-3">
              {((discoveries ?? []) as Pick<Discovery, "id" | "title" | "category" | "relevance_score" | "why_it_matters" | "discovered_at">[]).map((d) => (
                <li key={d.id}>
                  <Link href={`/research/${d.id}`} className="group block">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-8 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">{d.relevance_score ?? "—"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium group-hover:text-primary">{d.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {CATEGORY_LABELS[d.category]} · {relativeTime(d.discovered_at)}
                          {d.why_it_matters ? ` · ${d.why_it_matters}` : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No open discoveries. <Link href="/radar" className="text-primary hover:underline">Run a discovery</Link>.
            </p>
          )}
        </Card>

        <Card title="Guardian alerts" href="/guardian">
          {blocking ? (
            <p className="mb-3 flex items-center gap-2 text-sm text-destructive">
              <ShieldAlert className="size-4" /> {blocking} blocking issue{blocking === 1 ? "" : "s"} must be resolved before publishing.
            </p>
          ) : null}
          {(issues ?? []).length ? (
            <ul className="space-y-2">
              {((issues ?? []) as Pick<GuardianIssue, "id" | "title" | "severity" | "content_asset_id">[]).map((i) => (
                <li key={i.id}>
                  <Link href={`/studio/${i.content_asset_id}`} className="flex items-start gap-2 text-sm hover:text-primary">
                    <SeverityPill severity={i.severity} /> <span>{i.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open warnings.</p>
          )}
        </Card>

        <Card title="Ready for review" href="/studio">
          {(recentContent ?? []).length ? (
            <ul className="space-y-2">
              {((recentContent ?? []) as Pick<ContentAsset, "id" | "title" | "platform" | "status" | "guardian_status" | "updated_at">[]).map((c) => (
                <li key={c.id}>
                  <Link href={`/studio/${c.id}`} className="flex items-center gap-2 text-sm hover:text-primary">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{PLATFORMS[c.platform].label}</span>
                    <span className="flex-1 truncate">{c.title}</span>
                    <GuardianPill status={c.guardian_status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No drafts in progress.</p>
          )}
        </Card>

        <Card title="Upcoming in Buffer" href="/publishing">
          {connection ? (
            (upcoming ?? []).length ? (
              <>
                <ul className="space-y-2">
                  {((upcoming ?? []) as Pick<BufferPublication, "id" | "channel_name" | "text_sent" | "due_at" | "operation_status" | "buffer_status">[]).map((p) => (
                    <li key={p.id} className="flex items-start gap-3 text-sm">
                      <span className="w-36 shrink-0 text-xs text-muted-foreground">{p.due_at ? formatDateTime(p.due_at, tz) : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1">{p.text_sent}</span>
                        <span className="text-xs text-muted-foreground">{p.channel_name}</span>
                      </span>
                      <OperationPill status={p.operation_status} />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">From ORBIT&apos;s record of posts it created. Live Buffer queue is in Publishing.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing scheduled through ORBIT. The live Buffer queue is in Publishing.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Connect Buffer to see scheduled posts.</p>
          )}
        </Card>

        <Card title="Active campaigns" href="/campaigns">
          {(campaigns ?? []).length ? (
            <ul className="space-y-2">
              {((campaigns ?? []) as Pick<Campaign, "id" | "name" | "objective" | "status" | "start_date" | "end_date">[]).map((c) => (
                <li key={c.id}>
                  <Link href={`/campaigns/${c.id}`} className="flex items-center gap-2 text-sm hover:text-primary">
                    <span className="flex-1 truncate">{c.name}</span>
                    <Pill>{OBJECTIVE_LABELS[c.objective]}</Pill>
                    <span className="text-xs text-muted-foreground">{c.start_date ?? "no dates"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No active campaigns.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
