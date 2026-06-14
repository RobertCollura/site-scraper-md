import * as cheerio from "cheerio";
import { buildCompletenessReport } from "@/lib/completeness";
import { fetchPageWithStrategy } from "@/lib/fetch-strategy";
import { buildMarkdownFile } from "@/lib/markdown";
import { slugFromUrl } from "@/lib/sitemap";
import { extractPageMetadata } from "@/lib/rag-document";
import { optimizeMarkdownForRag } from "@/lib/rag-markdown";
import type { LinkedPdfResult, RelatedPdfReference, ScrapePageResult, ScrapeSettings } from "@/lib/types";

export async function scrapePage(
  url: string,
  settings: ScrapeSettings,
  options?: { domain?: string }
): Promise<ScrapePageResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
    try {
      const fetchResult = await fetchPageWithStrategy(url, settings);
      const { markdown, html, finalUrl, fetchMethod } = fetchResult;

      const $ = cheerio.load(html);
      const title =
        fetchResult.extractedTitle ||
        $("title").first().text().trim() ||
        $('meta[property="og:title"]').attr("content")?.trim() ||
        $("h1").first().text().trim() ||
        finalUrl;

      const scrapedAt = new Date().toISOString();
      const slug = slugFromUrl(finalUrl);

      const cleanedMarkdown = settings.ragOptimized
        ? optimizeMarkdownForRag(markdown)
        : markdown;

      let linkedPdfs: LinkedPdfResult[] = [];
      let relatedPdfRefs: RelatedPdfReference[] = [];
      let finalBody = cleanedMarkdown;

      if (settings.downloadLinkedPdfs) {
        const pdf = await import("@/lib/pdf");
        linkedPdfs = await pdf.processLinkedPdfs({
          html,
          pageUrl: finalUrl,
          pageTitle: title,
          settings,
          domain: options?.domain,
        });
        relatedPdfRefs = pdf.buildRelatedPdfReferences(linkedPdfs);
        if (settings.includePdfLinksInPageBody && relatedPdfRefs.length > 0) {
          finalBody = pdf.appendPdfLinksToBody(cleanedMarkdown, linkedPdfs);
        }
      }

      const completenessReport = buildCompletenessReport({
        markdown: finalBody,
        title,
        fetchMethod,
      });

      const metadata = extractPageMetadata($, {
        title,
        url: finalUrl,
        crawledAt: scrapedAt,
        body: finalBody,
      });

      const pageMarkdown = buildMarkdownFile({
        title: metadata.title,
        url: finalUrl,
        scrapedAt,
        body: finalBody,
        description: metadata.description,
        lastUpdated: metadata.lastUpdated,
        tags: metadata.tags,
        completenessReport,
        ragOptimized: settings.ragOptimized,
        relatedPdfs: relatedPdfRefs.length > 0 ? relatedPdfRefs : undefined,
      });

      return {
        url: finalUrl,
        title: metadata.title,
        slug,
        markdown: pageMarkdown,
        scrapedAt,
        completenessReport,
        linkedPdfs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < settings.maxRetries) {
        await new Promise((r) => setTimeout(r, settings.requestDelayMs * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("Failed to scrape page");
}
