"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2,
  Download,
  Eye,
  FolderOpen,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { CompletenessScoreBadge } from "@/components/CompletenessReport";
import { createScrapeZip, downloadBlob } from "@/lib/export";
import {
  loadPersistedFromDisk,
  saveLinkedPdfsToProject,
  savePageToProject,
  savePagesToProject,
} from "@/lib/export-client";
import { normalizeScrapeUrl, outputRelativePath } from "@/lib/export-path";
import { normalizeSettings } from "@/lib/settings";
import { slugFromUrl } from "@/lib/sitemap";
import { addHistoryEntry } from "@/lib/storage";
import {
  runWithConcurrency,
  useScrapeStore,
} from "@/store/scrape-store";
import type { DiscoveredPage } from "@/lib/types";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  scraping: "default",
  done: "default",
  error: "destructive",
};

// ---------------------------------------------------------------------------
// Memoised row — only re-renders when its own page object changes.
// updatePage creates a new object only for the changed page (all others keep
// the same reference), so React.memo skips N-1 rows on every page update.
// ---------------------------------------------------------------------------

interface PageRowProps {
  page: DiscoveredPage;
  togglePage: (id: string) => void;
  onPreview: (id: string) => void;
  isPreviewLoading: boolean;
  hasDomain: boolean;
}

const PageRow = memo(function PageRow({
  page,
  togglePage,
  onPreview,
  isPreviewLoading,
  hasDomain,
}: PageRowProps) {
  return (
    <TableRow className="transition-colors hover:bg-muted/40">
      <TableCell className="pl-4 sm:pl-6">
        <Checkbox
          checked={page.selected}
          onCheckedChange={() => togglePage(page.id)}
          aria-label={`Select ${page.url}`}
        />
      </TableCell>
      <TableCell className="max-w-[260px]">
        <Tooltip>
          <TooltipTrigger
            className="block w-full cursor-default truncate text-left font-medium"
            title={page.title}
          >
            {page.title}
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-sm">
            {page.slug && (
              <span className="mb-1 block font-mono text-[11px] opacity-80">
                {page.slug}.md
              </span>
            )}
            {page.title}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="max-w-[420px]">
        <Tooltip>
          <TooltipTrigger
            className="block w-full cursor-default truncate text-left text-muted-foreground"
            title={page.url}
          >
            {page.url}
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="start"
            className="max-w-md break-all font-mono text-[11px]"
          >
            {page.url}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant[page.status] ?? "outline"}>
          {page.status === "scraping" && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {page.status === "done" && (
            <CheckCircle2 className="mr-1 h-3 w-3" />
          )}
          {page.status === "error" && (
            <XCircle className="mr-1 h-3 w-3" />
          )}
          {page.status}
        </Badge>
        {page.error && (
          <p className="mt-1 text-xs text-destructive">{page.error}</p>
        )}
      </TableCell>
      <TableCell>
        {page.completenessReport ? (
          <CompletenessScoreBadge report={page.completenessReport} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="sticky right-0 z-10 bg-card pr-4 text-right shadow-[-1px_0_0_hsl(var(--border))] sm:pr-6">
        {page.status === "done" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={!page.markdown && !hasDomain}
            onClick={() => onPreview(page.id)}
          >
            {isPreviewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </>
            )}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
});

// ---------------------------------------------------------------------------
// Virtualised table body — renders only the rows visible in the viewport
// ---------------------------------------------------------------------------

const ESTIMATED_ROW_HEIGHT = 57;

interface VirtualTableProps {
  pages: DiscoveredPage[];
  allSelected: boolean;
  someSelected: boolean;
  toggleAll: (checked: boolean) => void;
  togglePage: (id: string) => void;
  onPreview: (pageId: string) => void;
  previewLoadingId: string | null;
  domain: string;
}

const VirtualTable = ({
  pages,
  allSelected,
  someSelected,
  toggleAll,
  togglePage,
  onPreview,
  previewLoadingId,
  domain,
}: VirtualTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: pages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const topPad = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const bottomPad =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : totalSize;

  return (
    <div
      ref={parentRef}
      className="overflow-auto border-y border-border sm:rounded-md sm:border"
      style={{ maxHeight: "72vh" }}
    >
      <Table className="min-w-[1050px]">
        <TableHeader className="sticky top-0 z-20 bg-card">
          <TableRow>
            <TableHead className="w-10 pl-4 sm:pl-6">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={() => toggleAll(!allSelected)}
                aria-label="Select all pages"
              />
            </TableHead>
            <TableHead className="min-w-[260px]">Title</TableHead>
            <TableHead className="min-w-[420px]">URL</TableHead>
            <TableHead className="min-w-[130px]">Status</TableHead>
            <TableHead className="min-w-[170px]">Completeness</TableHead>
            <TableHead className="sticky right-0 z-10 min-w-[140px] bg-card pr-4 text-right shadow-[-1px_0_0_hsl(var(--border))] sm:pr-6">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topPad > 0 && (
            <tr aria-hidden style={{ height: topPad }} />
          )}
          {virtualItems.map((virtualRow) => {
            const page = pages[virtualRow.index];
            return (
              <PageRow
                key={page.id}
                page={page}
                togglePage={togglePage}
                onPreview={onPreview}
                isPreviewLoading={previewLoadingId === page.id}
                hasDomain={!!domain}
              />
            );
          })}
          {bottomPad > 0 && (
            <tr aria-hidden style={{ height: bottomPad }} />
          )}
        </TableBody>
      </Table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResultsTable() {
  // Granular selectors — each hook only re-renders when its specific slice changes,
  // preventing unrelated store updates (e.g. discoveryMessage) from re-rendering the table.
  const pages = useScrapeStore((s) => s.pages);
  const baseUrl = useScrapeStore((s) => s.baseUrl);
  const domain = useScrapeStore((s) => s.domain);
  const settings = useScrapeStore((s) => s.settings);
  const isScraping = useScrapeStore((s) => s.isScraping);
  const setScraping = useScrapeStore((s) => s.setScraping);
  const togglePage = useScrapeStore((s) => s.togglePage);
  const toggleAll = useScrapeStore((s) => s.toggleAll);
  const updatePage = useScrapeStore((s) => s.updatePage);
  const batchUpdatePages = useScrapeStore((s) => s.batchUpdatePages);
  const setScrapeStartedAt = useScrapeStore((s) => s.setScrapeStartedAt);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const allSelected = useMemo(
    () => pages.length > 0 && pages.every((p) => p.selected),
    [pages]
  );

  const someSelected = useMemo(
    () => !allSelected && pages.some((p) => p.selected),
    [pages, allSelected]
  );

  const previewPage = useMemo(
    () => pages.find((p) => p.id === previewId),
    [pages, previewId]
  );

  const donePages = useMemo(
    () => pages.filter((p) => p.status === "done" && p.completenessReport),
    [pages]
  );

  const hasDonePages = useMemo(
    () => pages.some((p) => p.status === "done"),
    [pages]
  );

  const scrapeSummary = useMemo(() => {
    if (donePages.length === 0) return null;
    const avgScore = Math.round(
      donePages.reduce((sum, p) => sum + (p.completenessReport?.completenessScore ?? 0), 0) /
        donePages.length
    );
    const poorCount = donePages.filter(
      (p) => (p.completenessReport?.completenessScore ?? 100) < 50
    ).length;
    const firecrawlCount = donePages.filter(
      (p) => p.completenessReport?.fetchMethod === "firecrawl"
    ).length;
    return { avgScore, poorCount, firecrawlCount, total: donePages.length };
  }, [donePages]);

  const selectedPages = useMemo(
    () => pages.filter((p) => p.selected),
    [pages]
  );

  const pendingSelectedCount = useMemo(
    () => selectedPages.filter((p) => p.status !== "done").length,
    [selectedPages]
  );

  async function saveToProject(pagesToSave = pages): Promise<boolean> {
    if (!domain) return false;

    setIsSaving(true);
    try {
      const data = await savePagesToProject(domain, pagesToSave);
      setExportMessage(
        `Saved ${data.pageCount} page(s) to ${data.relativePath}/ (${data.fileCount} files including index.md).`
      );
      return true;
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "Failed to save to project folder."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResumeFromDisk() {
    if (!domain) return;

    setIsResuming(true);
    setExportMessage(null);

    try {
      const persisted = await loadPersistedFromDisk(domain);
      if (persisted.pageCount === 0) {
        setExportMessage(`No saved pages found in ${persisted.relativePath}/.`);
        return;
      }

      const byUrl = new Map(
        persisted.pages.map((p) => [normalizeScrapeUrl(p.url), p])
      );
      const bySlug = new Map(persisted.pages.map((p) => [p.slug, p]));
      const currentPages = useScrapeStore.getState().pages;

      // Collect all patches then apply in a single state update — avoids N re-renders.
      const updates: Array<{ id: string; patch: Partial<DiscoveredPage> }> = [];

      for (const page of currentPages) {
        if (page.status === "scraping") {
          updates.push({ id: page.id, patch: { status: "pending" } });
        }
      }

      let restored = 0;
      for (const page of currentPages) {
        const match =
          byUrl.get(normalizeScrapeUrl(page.url)) ??
          bySlug.get(slugFromUrl(page.url));
        if (!match) continue;

        updates.push({
          id: page.id,
          patch: {
            status: "done",
            title: match.title,
            slug: match.slug,
            markdown: match.markdown,
            completenessReport: match.completenessReport,
            selected: false,
            error: undefined,
          },
        });
        restored++;
      }

      // Single state update → single re-render
      if (updates.length > 0) batchUpdatePages(updates);

      const remaining = useScrapeStore
        .getState()
        .pages.filter((p) => p.status !== "done").length;

      setExportMessage(
        restored > 0
          ? `Restored ${restored} page(s) from ${persisted.relativePath}/. ${remaining} page(s) still need scraping — select them and click Scrape Selected.`
          : `Found ${persisted.pageCount} saved page(s) on disk, but none match the current discovered URLs.`
      );
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "Failed to resume from local folder."
      );
    } finally {
      setIsResuming(false);
    }
  }

  async function scrapeSelected() {
    const queue = selectedPages.filter((p) => p.status !== "done");
    if (queue.length === 0) {
      setExportMessage("All selected pages are already done. Use Resume from output/ to load saved pages.");
      return;
    }

    setScraping(true);
    setScrapeStartedAt(Date.now());
    setExportMessage(null);

    let saveErrors = 0;
    let pdfCount = 0;

    await runWithConcurrency(queue.map((p) => p.id), settings.maxConcurrency, async (pageId) => {
      const page = useScrapeStore.getState().pages.find((p) => p.id === pageId);
      if (!page || page.status === "done") return;

      updatePage(pageId, { status: "scraping", error: undefined, completenessReport: undefined });

      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: page.url,
            domain,
            settings: normalizeSettings(settings),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Scrape failed");

        const completedPage = {
          ...page,
          status: "done" as const,
          title: data.title,
          slug: data.slug,
          markdown: data.markdown,
          completenessReport: data.completenessReport,
        };

        updatePage(pageId, {
          status: "done",
          title: data.title,
          slug: data.slug,
          markdown: data.markdown,
          completenessReport: data.completenessReport,
        });

        if (domain) {
          try {
            await savePageToProject(domain, completedPage);
          } catch {
            saveErrors += 1;
          }

          if (data.linkedPdfs?.length) {
            try {
              const pdfSave = await saveLinkedPdfsToProject(domain, data.linkedPdfs);
              pdfCount += pdfSave.savedCount;
            } catch {
              saveErrors += 1;
            }
          }
        }
      } catch (error) {
        updatePage(pageId, {
          status: "error",
          error: error instanceof Error ? error.message : "Scrape failed",
        });
      } finally {
        if (settings.requestDelayMs > 0) {
          await new Promise((r) => setTimeout(r, settings.requestDelayMs));
        }
      }
    });

    setScraping(false);

    const state = useScrapeStore.getState();
    const successCount = state.pages.filter((p) => p.status === "done").length;
    if (successCount > 0 && domain) {
      addHistoryEntry({
        id: crypto.randomUUID(),
        domain,
        baseUrl,
        scrapedAt: new Date().toISOString(),
        pageCount: state.pages.length,
        successCount,
        config: settings,
      });
    }

    if (saveErrors > 0) {
      setExportMessage(
        `Scrape finished, but ${saveErrors} save error(s). Use Save to output/ to retry.${pdfCount > 0 ? ` ${pdfCount} PDF(s) extracted.` : ""}`
      );
    } else if (pdfCount > 0) {
      setExportMessage(`Scrape finished. Extracted ${pdfCount} linked PDF(s) to output/${domain}/pdfs/.`);
    }
  }

  async function handleZipDownload() {
    if (!domain) return;
    const blob = await createScrapeZip(domain, pages);
    downloadBlob(blob, `${domain}.zip`);
    setExportMessage("ZIP downloaded successfully.");
  }

  async function handleSaveToProject() {
    await saveToProject();
  }

  // Stable reference — only recreates when domain changes.
  const handleOpenPreview = useCallback(async (pageId: string) => {
    const page = useScrapeStore.getState().pages.find((entry) => entry.id === pageId);
    if (!page || page.status !== "done") return;

    if (page.markdown) {
      setPreviewId(pageId);
      return;
    }

    if (!domain) {
      setExportMessage("Preview is only available after markdown has been loaded or saved to output/.");
      return;
    }

    setPreviewLoadingId(pageId);
    setExportMessage(null);

    try {
      const persisted = await loadPersistedFromDisk(domain);
      const match =
        persisted.pages.find((entry) => normalizeScrapeUrl(entry.url) === normalizeScrapeUrl(page.url)) ??
        persisted.pages.find((entry) => entry.slug === page.slug);

      if (!match) {
        setExportMessage(
          "No saved markdown found for that page yet. Scrape it first or use Resume from output/."
        );
        return;
      }

      useScrapeStore.getState().updatePage(pageId, {
        title: match.title,
        slug: match.slug,
        markdown: match.markdown,
        completenessReport: match.completenessReport,
      });
      setPreviewId(pageId);
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "Failed to load the saved preview from output/."
      );
    } finally {
      setPreviewLoadingId(null);
    }
  }, [domain]);

  if (pages.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Discovered Pages</CardTitle>
              <CardDescription>
                Each page saves to{" "}
                <code className="bg-muted px-1 py-0.5 font-mono text-xs">
                  {domain ? `${outputRelativePath(domain)}/` : "output/{domain}/"}
                </code>{" "}
                as soon as it finishes. Use Resume to pick up from saved files.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleResumeFromDisk}
                disabled={isResuming || !domain}
              >
                {isResuming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Resume from output/
                  </>
                )}
              </Button>
              <Button
                onClick={scrapeSelected}
                disabled={isScraping || pendingSelectedCount === 0}
              >
                {isScraping ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scraping…
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Scrape Selected
                    {pendingSelectedCount > 0 && pendingSelectedCount < selectedPages.length
                      ? ` (${pendingSelectedCount})`
                      : ""}
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={handleZipDownload}
                disabled={!hasDonePages}
              >
                <Download className="mr-2 h-4 w-4" />
                Download ZIP
              </Button>
              <Button
                variant="secondary"
                onClick={handleSaveToProject}
                disabled={isSaving || !hasDonePages}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Save to output/
                  </>
                )}
              </Button>
            </div>
          </div>
          {scrapeSummary && (
            <p className="text-sm text-muted-foreground">
              Completeness: avg {scrapeSummary.avgScore}% across {scrapeSummary.total} page
              {scrapeSummary.total === 1 ? "" : "s"}
              {scrapeSummary.poorCount > 0 && (
                <span className="text-destructive">
                  {" "}
                  · {scrapeSummary.poorCount} need review (&lt;50%)
                </span>
              )}
              {" "}
              {scrapeSummary.firecrawlCount > 0 && (
                <span> · {scrapeSummary.firecrawlCount} via Firecrawl</span>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Scroll horizontally to see every column. The `Preview` button opens the per-page scrape
            preview dialog.
          </p>
          {exportMessage && (
            <p className="text-sm text-muted-foreground">{exportMessage}</p>
          )}
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <VirtualTable
            pages={pages}
            allSelected={allSelected}
            someSelected={someSelected}
            toggleAll={toggleAll}
            togglePage={togglePage}
            onPreview={handleOpenPreview}
            previewLoadingId={previewLoadingId}
            domain={domain}
          />
        </CardContent>
      </Card>

      <MarkdownPreview
        open={!!previewPage}
        onOpenChange={(open) => !open && setPreviewId(null)}
        title={previewPage?.title ?? "Preview"}
        markdown={previewPage?.markdown ?? ""}
        completenessReport={previewPage?.completenessReport}
      />
    </>
  );
}
