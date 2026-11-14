import {
  BookOpenText,
  Brain,
  CalendarRange,
  LayoutDashboard,
  Mic,
  PenLine,
  Radar,
  Send,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/radar", label: "Radar", icon: Radar },
  { href: "/research", label: "Research", icon: BookOpenText },
  { href: "/voice", label: "My Voice", icon: Mic },
  { href: "/studio", label: "Studio", icon: PenLine },
  { href: "/campaigns", label: "Campaigns", icon: CalendarRange },
  { href: "/guardian", label: "Guardian", icon: ShieldCheck },
  { href: "/publishing", label: "Publishing", icon: Send },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];
