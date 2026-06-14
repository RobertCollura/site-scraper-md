"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, Settings, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sites", label: "Scraped Sites", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
      <div>
        <p className="text-sm font-semibold">{APP_NAME}</p>
        <p className="text-xs text-muted-foreground">Sitemap → Markdown</p>
      </div>
      <Sheet>
        <SheetTrigger
          className="inline-flex h-9 w-9 items-center justify-center border border-border bg-background hover:bg-muted"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-border bg-background p-0">
          <nav className="flex flex-col gap-0.5 p-3 pt-8">
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
                    "flex items-center gap-3 border border-transparent px-3 py-2.5 text-[13px]",
                    active
                      ? "border-border bg-muted text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-accent-blue")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
