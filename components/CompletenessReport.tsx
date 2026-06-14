"use client";

import { AlertTriangle, CheckCircle2, ScrollText, Zap } from "lucide-react";
import type { ScrapeCompletenessReport } from "@/lib/types";
import { gradeBadgeVariant } from "@/lib/completeness";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CompletenessReportProps {
  report: ScrapeCompletenessReport;
  compact?: boolean;
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function CompletenessReportPanel({ report, compact = false }: CompletenessReportProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={gradeBadgeVariant(report.grade)}>
          {report.completenessScore}% · {report.grade}
        </Badge>
        <Badge variant="outline">{report.fetchMethod}</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {report.completenessScore >= 75 ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          )}
          <div>
            <p className="text-lg font-semibold">{report.completenessScore}% complete</p>
            <p className="text-sm capitalize text-muted-foreground">{report.grade} confidence</p>
          </div>
        </div>
        <Badge variant={gradeBadgeVariant(report.grade)}>{report.grade}</Badge>
        <Badge variant="outline">{report.fetchMethod}</Badge>
      </div>

      {report.warnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Warnings ({report.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {report.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <ScrollText className="h-4 w-4" />
          Content captured
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatItem label="Characters" value={report.contentCharCount.toLocaleString()} />
          <StatItem label="Words" value={report.contentWordCount.toLocaleString()} />
          <StatItem label="Headings" value={report.headingCount} />
          <StatItem label="Fetch method" value={report.fetchMethod} />
        </div>
      </div>

      {report.completenessScore >= 75 && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <Zap className="h-4 w-4" />
          Good signal — content looks complete.
        </p>
      )}
    </div>
  );
}

export function CompletenessScoreBadge({
  report,
}: {
  report: ScrapeCompletenessReport;
}) {
  return (
    <Badge variant={gradeBadgeVariant(report.grade)} className="whitespace-nowrap">
      {report.completenessScore}% {report.grade}
    </Badge>
  );
}
