"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { signOut } from "@/app/actions/auth";
import { NAV_ITEMS } from "./nav-items";
import { OrbitMark } from "./orbit-mark";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 outline-none transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground")} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Account({ name, email }: { name: string | null; email: string | null }) {
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border px-3 pt-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium uppercase">
        {(name ?? email ?? "?").slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name ?? "Your account"}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}

export function AppShell({ children, name, email }: { children: React.ReactNode; name: string | null; email: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <div>
          <Link href="/dashboard" className="mb-7 flex items-center gap-2.5 px-3">
            <OrbitMark />
            <span className="text-sm font-semibold tracking-[0.2em]">ORBIT</span>
          </Link>
          <NavList />
        </div>
        <Account name={name} email={email} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <OrbitMark />
            <span className="text-sm font-semibold tracking-[0.2em]">ORBIT</span>
          </Link>
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-4">
            <SheetTitle className="mb-4 px-3 text-sm font-semibold tracking-[0.2em]">ORBIT</SheetTitle>
            <div className="flex h-full flex-col justify-between pb-6">
              <NavList onNavigate={() => setOpen(false)} />
              <Account name={name} email={email} />
            </div>
          </SheetContent>
        </Sheet>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
