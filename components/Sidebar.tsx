"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, LayoutDashboard, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sites", label: "Scraped Sites", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
      <div className="border-b border-border px-5 py-5">
        <p className="text-[15px] font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Sitemap → Markdown</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 border border-transparent px-3 py-2.5 text-[13px] transition-colors",
                active
                  ? "border-border bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-accent-blue")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Export clean Markdown with frontmatter, completeness reports, and local
          file output.
        </p>
      </div>
    </aside>
  );
}
