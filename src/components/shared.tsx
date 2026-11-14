import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Info, OctagonAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

const TONES = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  accent: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone = "neutral", children, className, icon: Icon }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function GuardianPill({ status }: { status: string }) {
  switch (status) {
    case "pass":
      return <Pill tone="success" icon={CheckCircle2}>Guardian passed</Pill>;
    case "warnings":
      return <Pill tone="warning" icon={AlertTriangle}>Review warnings</Pill>;
    case "blocking":
      return <Pill tone="danger" icon={OctagonAlert}>Blocking issues</Pill>;
    case "stale":
      return <Pill tone="neutral" icon={Clock}>Edited since check</Pill>;
    default:
      return <Pill tone="neutral" icon={CircleDashed}>Not checked</Pill>;
  }
}

export function SeverityPill({ severity }: { severity: string }) {
  if (severity === "blocking") return <Pill tone="danger" icon={OctagonAlert}>Blocking</Pill>;
  if (severity === "warning") return <Pill tone="warning" icon={AlertTriangle}>Warning</Pill>;
  return <Pill tone="neutral" icon={Info}>Info</Pill>;
}

export function OperationPill({ status }: { status: string }) {
  if (status === "succeeded") return <Pill tone="success" icon={CheckCircle2}>Created in Buffer</Pill>;
  if (status === "failed") return <Pill tone="danger" icon={XCircle}>Failed</Pill>;
  if (status === "unknown") return <Pill tone="warning" icon={AlertTriangle}>Outcome uncertain</Pill>;
  return <Pill tone="neutral" icon={Clock}>Pending</Pill>;
}

const CONTENT_STATUS_TONE: Record<string, Tone> = {
  idea: "neutral",
  draft: "neutral",
  in_review: "accent",
  approved: "success",
  scheduled: "accent",
  published: "success",
  rejected: "danger",
  archived: "neutral",
};

export function ContentStatusPill({ status }: { status: string }) {
  return <Pill tone={CONTENT_STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Pill>;
}

export function Notice({ tone = "neutral", title, children, icon: Icon = Info }: { tone?: Tone; title?: string; children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3.5 text-sm", TONES[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-foreground/90">
        {title ? <p className="mb-0.5 font-medium text-foreground">{title}</p> : null}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Styled native select: accessible and reliable on every device. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-input/30 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
