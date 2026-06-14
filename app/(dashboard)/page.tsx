"use client";

import { ProgressPanel } from "@/components/ProgressPanel";
import { ResultsTable } from "@/components/ResultsTable";
import { ScrapeForm } from "@/components/ScrapeForm";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-3 border-b border-border pb-8">
        <h1 className="text-foreground">Dashboard</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Discover pages from a website sitemap, scrape them into clean Markdown, and
          save to the local <code className="bg-muted px-1 py-0.5 font-mono text-xs">output/</code>{" "}
          folder. JavaScript-rendered content is handled by Firecrawl when configured.
        </p>
      </header>

      <ScrapeForm />
      <ProgressPanel />
      <ResultsTable />
    </div>
  );
}
