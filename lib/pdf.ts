import fs from "fs/promises";
import path from "path";
import {
  extractPdfLinksFromHtml,
  pdfSlugFromUrl,
  pdfTitleFromUrl,
  type PdfLinkCandidate,
} from "@/lib/pdf-links";
import { buildPdfMarkdownFile } from "@/lib/markdown";
import { optimizeMarkdownForRag } from "@/lib/rag-markdown";
import { getCachedPdfPath } from "@/lib/output-paths";
import type { LinkedPdfResult, RelatedPdfReference, ScrapeSettings } from "@/lib/types";

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

async function downloadPdfBuffer(
  pdfUrl: string,
  settings: ScrapeSettings
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(pdfUrl, {
      headers: {
        "User-Agent": settings.userAgent,
        Accept: "application/pdf,application/octet-stream,*/*",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isPdfBuffer(buffer)) {
      throw new Error("Downloaded file is not a valid PDF");
    }

    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const text = result.text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!text) {
      throw new Error("No extractable text found in PDF (may be scanned/image-only)");
    }

    return { text, pageCount: result.total || result.pages.length || 1 };
  } finally {
    await parser.destroy();
  }
}

function uniqueSlug(baseSlug: string, used: Set<string>): string {
  if (!used.has(baseSlug)) {
    used.add(baseSlug);
    return baseSlug;
  }

  let index = 2;
  while (used.has(`${baseSlug}-${index}`)) {
    index += 1;
  }

  const slug = `${baseSlug}-${index}`;
  used.add(slug);
  return slug;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function processLinkedPdfs(options: {
  html: string;
  pageUrl: string;
  pageTitle: string;
  settings: ScrapeSettings;
  domain?: string;
}): Promise<LinkedPdfResult[]> {
  if (!options.settings.downloadLinkedPdfs) {
    return [];
  }

  const candidates = extractPdfLinksFromHtml(options.html, options.pageUrl).slice(
    0,
    options.settings.maxLinkedPdfsPerPage
  );

  if (candidates.length === 0) {
    return [];
  }

  const usedSlugs = new Set<string>();
  const results: LinkedPdfResult[] = [];

  for (const candidate of candidates) {
    try {
      const result = await processSinglePdf({
        candidate,
        pageUrl: options.pageUrl,
        pageTitle: options.pageTitle,
        settings: options.settings,
        domain: options.domain,
        usedSlugs,
      });
      results.push(result);
    } catch (error) {
      results.push({
        slug: pdfSlugFromUrl(candidate.resolvedPdfUrl),
        title: pdfTitleFromUrl(candidate.resolvedPdfUrl, candidate.label),
        pdfUrl: candidate.resolvedPdfUrl,
        sourcePageUrl: options.pageUrl,
        markdown: "",
        pdfFileName: "",
        pageCount: 0,
        charCount: 0,
        error: error instanceof Error ? error.message : "PDF processing failed",
      });
    }

    if (options.settings.requestDelayMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(options.settings.requestDelayMs, 300)));
    }
  }

  return results;
}

async function processSinglePdf(options: {
  candidate: PdfLinkCandidate;
  pageUrl: string;
  pageTitle: string;
  settings: ScrapeSettings;
  domain?: string;
  usedSlugs: Set<string>;
}): Promise<LinkedPdfResult> {
  const { candidate, pageUrl, pageTitle, settings, domain, usedSlugs } = options;
  const baseSlug = pdfSlugFromUrl(candidate.resolvedPdfUrl);
  const slug = uniqueSlug(baseSlug, usedSlugs);
  const title = pdfTitleFromUrl(candidate.resolvedPdfUrl, candidate.label);
  const pdfFileName = `${slug}.pdf`;
  const scrapedAt = new Date().toISOString();

  let pdfPath: string | undefined;
  if (domain) {
    pdfPath = getCachedPdfPath(domain, pdfFileName);
  }

  let buffer: Buffer;
  let skipped = false;

  if (pdfPath && (await fileExists(pdfPath))) {
    buffer = await fs.readFile(pdfPath);
    skipped = true;
  } else {
    buffer = await downloadPdfBuffer(candidate.resolvedPdfUrl, settings);
    if (pdfPath) {
      await fs.mkdir(path.dirname(pdfPath), { recursive: true });
      await fs.writeFile(pdfPath, buffer);
    }
  }

  const { text, pageCount } = await extractPdfText(buffer);
  const markdown = buildPdfMarkdownFile({
    title,
    pdfUrl: candidate.resolvedPdfUrl,
    sourcePageUrl: pageUrl,
    sourcePageTitle: pageTitle,
    scrapedAt,
    pageCount,
    body: optimizeMarkdownForRag(text),
    pdfFileName,
  });

  return {
    slug,
    title,
    pdfUrl: candidate.resolvedPdfUrl,
    sourcePageUrl: pageUrl,
    markdown,
    pdfFileName,
    pageCount,
    charCount: text.length,
    skipped,
  };
}

export function buildRelatedPdfReferences(
  linkedPdfs: LinkedPdfResult[]
): RelatedPdfReference[] {
  return linkedPdfs
    .filter((pdf) => pdf.markdown && !pdf.error)
    .map((pdf) => ({
      title: pdf.title,
      slug: pdf.slug,
      pdf_url: pdf.pdfUrl,
    }));
}

export function appendPdfLinksToBody(
  body: string,
  linkedPdfs: LinkedPdfResult[]
): string {
  const successful = linkedPdfs.filter((pdf) => pdf.markdown && !pdf.error);
  if (successful.length === 0) return body;

  const lines = [
    "",
    "## Related PDF extracts",
    "",
    ...successful.map((pdf) => `- **${pdf.title}** — ${pdf.pdfUrl}`),
    "",
  ];

  return `${body.trim()}${lines.join("\n")}`;
}

