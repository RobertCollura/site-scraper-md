import { fetchWithFirecrawl, isFirecrawlConfigured } from "@/lib/firecrawl-fetch";
import type { FetchMethod, ScrapeSettings } from "@/lib/types";
import { htmlToMarkdown } from "@/lib/markdown";

export interface FetchPageResult {
  /** Markdown content — Firecrawl returns this directly; HTTP fallback converts from HTML */
  markdown: string;
  /** Raw HTML — still needed for PDF link extraction and metadata */
  html: string;
  finalUrl: string;
  fetchMethod: FetchMethod;
  extractedTitle?: string;
}

async function fetchWithHttp(
  url: string,
  settings: ScrapeSettings
): Promise<FetchPageResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.scrapeTimeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": settings.userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const html = await response.text();
    const markdown = htmlToMarkdown(html);
    return { markdown, html, finalUrl: response.url || url, fetchMethod: "static" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPageWithStrategy(
  url: string,
  settings: ScrapeSettings
): Promise<FetchPageResult> {
  if (isFirecrawlConfigured()) {
    return fetchWithFirecrawl(url, settings);
  }
  return fetchWithHttp(url, settings);
}
