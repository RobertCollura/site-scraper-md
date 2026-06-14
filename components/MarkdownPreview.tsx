"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import matter from "gray-matter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompletenessReportPanel } from "@/components/CompletenessReport";
import type { ScrapeCompletenessReport } from "@/lib/types";

interface MarkdownPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  markdown: string;
  completenessReport?: ScrapeCompletenessReport;
}

function extractBody(raw: string): string {
  try {
    return matter(raw).content.trim();
  } catch {
    return raw.trim();
  }
}

export function MarkdownPreview({
  open,
  onOpenChange,
  title,
  markdown,
  completenessReport,
}: MarkdownPreviewProps) {
  const [activeTab, setActiveTab] = useState(() =>
    completenessReport ? "report" : "markdown"
  );
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setActiveTab(completenessReport ? "report" : "markdown");
  }

  const body = extractBody(markdown);
  const source = markdown.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * flex flex-col + max-h caps the dialog height.
       * sm:max-w-[1100px] overrides the dialog base sm:max-w-lg.
       * p-0 lets us control inner padding per-section.
       */}
      <DialogContent className="flex flex-col gap-0 max-h-[90vh] w-[min(96vw,1100px)] sm:max-w-[1100px] p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/*
         * Tabs fills remaining height. TabsContent uses overflow-y-auto so each
         * panel scrolls independently — avoids the ScrollArea height-inheritance problem.
         */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList
            variant="line"
            className="shrink-0 w-full justify-start border-b border-border px-6 pb-0"
          >
            {completenessReport && (
              <TabsTrigger value="report">Completeness</TabsTrigger>
            )}
            <TabsTrigger value="markdown">Preview</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
          </TabsList>

          {completenessReport && (
            <TabsContent
              value="report"
              className="flex-1 overflow-y-auto px-6 py-4"
            >
              <CompletenessReportPanel report={completenessReport} />
            </TabsContent>
          )}

          {/* Rendered markdown */}
          <TabsContent
            value="markdown"
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  a: ({ href, children, ...props }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  ),
                  img: ({ src, alt, ...props }) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={alt ?? ""} className="max-w-full rounded" {...props} />
                  ),
                }}
              >
                {body}
              </ReactMarkdown>
            </div>
          </TabsContent>

          {/* Raw markdown source */}
          <TabsContent
            value="source"
            className="flex-1 overflow-y-auto"
          >
            <pre className="h-full min-h-0 whitespace-pre-wrap break-words bg-muted/30 px-6 py-4 font-mono text-xs leading-relaxed">
              {source}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
