"use client";

import { useEffect, useState } from "react";
import { Clock, Layers } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScrapeStore } from "@/store/scrape-store";

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

function StatBox({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="surface-muted p-3">
      <div className="flex items-center gap-2 text-[11px] tracking-wider text-muted-foreground uppercase">
        {icon}
        {label}
      </div>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${valueClassName ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

export function ProgressPanel() {
  const {
    pages,
    isScraping,
    isDiscovering,
    discoveryMessage,
    discoverySource,
    scrapeStartedAt,
    settings,
  } = useScrapeStore();

  const [etaSeconds, setEtaSeconds] = useState(0);

  const selectedCount = pages.filter((p) => p.selected).length;
  const doneCount = pages.filter((p) => p.status === "done").length;
  const errorCount = pages.filter((p) => p.status === "error").length;
  const processed = doneCount + errorCount;
  const total = selectedCount || pages.length;
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

  useEffect(() => {
    if (!isScraping || !scrapeStartedAt || processed === 0 || processed >= total) {
      return;
    }

    const updateEta = () => {
      const elapsed = (Date.now() - scrapeStartedAt) / 1000;
      const rate = processed / elapsed;
      setEtaSeconds(rate > 0 ? (total - processed) / rate : 0);
    };

    updateEta();
    const intervalId = window.setInterval(updateEta, 1000);
    return () => window.clearInterval(intervalId);
  }, [isScraping, scrapeStartedAt, processed, total]);

  if (pages.length === 0 && !isDiscovering) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Progress</CardTitle>
          <div className="flex flex-wrap gap-2">
            {discoverySource && <Badge variant="outline">{discoverySource}</Badge>}
            {isDiscovering && <Badge variant="secondary">Discovering…</Badge>}
            {isScraping && <Badge>Scraping</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {discoveryMessage && (
          <p className="text-sm leading-relaxed text-muted-foreground">{discoveryMessage}</p>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              {processed} / {total} pages
            </span>
            <span className="tabular-nums text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox
            label="Total"
            value={pages.length}
            icon={<Layers className="h-3.5 w-3.5" />}
          />
          <StatBox label="Selected" value={selectedCount} />
          <StatBox
            label="Completed"
            value={doneCount}
            valueClassName="text-accent-blue"
          />
          <StatBox
            label="ETA"
            value={isScraping ? formatEta(etaSeconds) : "—"}
            icon={<Clock className="h-3.5 w-3.5" />}
          />
        </div>
        {errorCount > 0 && (
          <p className="text-sm text-destructive">
            {errorCount} page{errorCount === 1 ? "" : "s"} failed — retries up to{" "}
            {settings.maxRetries}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
