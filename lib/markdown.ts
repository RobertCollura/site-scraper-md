import matter from "gray-matter";
import TurndownService from "turndown";
import {
  buildRagDocumentBody,
  buildRagFrontmatter,
  cleanPageTitle,
  countWords,
  estimateTokens,
  extractChunkSections,
  hashContent,
  tagsFromUrl,
  buildEmbedText,
} from "@/lib/rag-document";
import { markdownPlainText } from "@/lib/rag-markdown";
import type { RelatedPdfReference, ScrapeCompletenessReport } from "@/lib/types";

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });

  service.addRule("preservePre", {
    filter: ["pre"],
    replacement: (content) => {
      const text = content.trim();
      return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
    },
  });

  service.addRule("dropJavascriptLinks", {
    filter(node) {
      if (node.nodeName !== "A") return false;
      const el = node as { getAttribute?: (name: string) => string | null };
      const href = el.getAttribute?.("href") ?? "";
      return /^javascript:/i.test(href) || href === "#" || href.startsWith("#");
    },
    replacement(content) {
      const text = content.trim();
      if (
        /^(show models?|show model|shop models?|previous|next|watch the video|clear all|clear filters?|reset filters?|apply|cancel|close)$/i.test(
          text
        )
      ) {
        return "";
      }
      return text ? `\n\n${text}\n\n` : "";
    },
  });

  service.addRule("imagesKeepUrl", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as { getAttribute?: (name: string) => string | null };
      const src = el.getAttribute?.("src")?.trim() ?? "";
      const alt = el.getAttribute?.("alt")?.trim() ?? "image";
      if (!src) return alt ? `\n\n*[Image: ${alt}]*\n\n` : "";
      return `\n\n![${alt}](${src})\n\n`;
    },
  });

  return service;
}

export function htmlToMarkdown(html: string): string {
  const turndown = createTurndown();
  const cleaned = html
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return turndown.turndown(cleaned).replace(/\n{3,}/g, "\n\n").trim();
}

export interface BuildMarkdownFileOptions {
  title: string;
  url: string;
  scrapedAt: string;
  body: string;
  description?: string;
  lastUpdated?: string;
  tags?: string[];
  completenessReport?: ScrapeCompletenessReport;
  ragOptimized?: boolean;
  relatedPdfs?: RelatedPdfReference[];
}

export function buildMarkdownFile(options: BuildMarkdownFileOptions): string {
  if (options.ragOptimized) {
    const title = cleanPageTitle(options.title);
    const plainBody = markdownPlainText(options.body);
    const chunkSections = extractChunkSections(options.body);
    const frontmatter = buildRagFrontmatter({
      title,
      description: options.description ?? title,
      url: options.url,
      sourceDomain: new URL(options.url).hostname,
      crawledAt: options.scrapedAt,
      lastUpdated: options.lastUpdated,
      tags: options.tags ?? tagsFromUrl(options.url),
      wordCount: countWords(plainBody),
      tokenEstimate: estimateTokens(plainBody),
      contentHash: hashContent(plainBody),
      embedText: buildEmbedText(title, options.description ?? title, options.body),
      chunkSections,
      relatedPdfs: options.relatedPdfs,
      completenessReport: options.completenessReport,
      documentType: "web-page",
    });

    const documentBody = buildRagDocumentBody({
      title,
      url: options.url,
      crawledAt: options.scrapedAt,
      body: options.body,
    });

    return matter.stringify(documentBody, frontmatter);
  }

  const frontmatter: Record<string, string | number | boolean> = {
    title: options.title,
    url: options.url,
    crawled_at: options.scrapedAt,
  };

  if (options.completenessReport) {
    frontmatter.completeness_score = options.completenessReport.completenessScore;
    frontmatter.completeness_grade = options.completenessReport.grade;
  }

  return matter.stringify(options.body, frontmatter);
}

export function buildPdfMarkdownFile(options: {
  title: string;
  pdfUrl: string;
  sourcePageUrl: string;
  sourcePageTitle: string;
  scrapedAt: string;
  pageCount: number;
  body: string;
  pdfFileName: string;
}): string {
  const title = cleanPageTitle(options.title);
  const description = `Extracted text from PDF linked on ${options.sourcePageTitle}.`;
  const bodyContent = options.body.trim();
  const plainBody = markdownPlainText(bodyContent);
  const chunkSections = extractChunkSections(bodyContent);

  const frontmatter = buildRagFrontmatter({
    title,
    description,
    url: options.pdfUrl,
    sourceDomain: new URL(options.pdfUrl).hostname,
    crawledAt: options.scrapedAt,
    tags: [...tagsFromUrl(options.sourcePageUrl), "pdf"],
    wordCount: countWords(plainBody),
    tokenEstimate: estimateTokens(plainBody),
    contentHash: hashContent(plainBody),
    embedText: buildEmbedText(title, description, bodyContent),
    chunkSections,
    documentType: "pdf-extract",
    pdfUrl: options.pdfUrl,
    sourcePageUrl: options.sourcePageUrl,
    pdfPages: options.pageCount,
  });

  const documentBody = buildRagDocumentBody({
    title,
    url: options.pdfUrl,
    crawledAt: options.scrapedAt,
    body: `## Document\n\n${bodyContent}`,
  });

  return matter.stringify(documentBody, frontmatter);
}

export interface ParsedPersistedPage {
  slug: string;
  url: string;
  title: string;
  scrapedAt: string;
  markdown: string;
  completenessScore?: number;
  completenessGrade?: string;
  fetchMethod?: string;
  contentChars?: number;
  contentWords?: number;
}

export function parsePersistedMarkdownFile(
  slug: string,
  raw: string
): ParsedPersistedPage | null {
  try {
    const { data } = matter(raw);
    const url = typeof data.url === "string" ? data.url : "";
    if (!url) return null;

    const scrapedAt =
      typeof data.crawled_at === "string"
        ? data.crawled_at
        : typeof data.scraped_at === "string"
          ? data.scraped_at
          : new Date().toISOString();

    return {
      slug,
      url,
      title: typeof data.title === "string" ? data.title : slug,
      scrapedAt,
      markdown: raw,
      completenessScore:
        typeof data.completeness_score === "number"
          ? data.completeness_score
          : undefined,
      completenessGrade:
        typeof data.completeness_grade === "string"
          ? data.completeness_grade
          : undefined,
      fetchMethod:
        typeof data.fetch_method === "string" ? data.fetch_method : undefined,
      contentChars:
        typeof data.content_chars === "number" ? data.content_chars : undefined,
      contentWords:
        typeof data.word_count === "number"
          ? data.word_count
          : typeof data.content_words === "number"
            ? data.content_words
            : undefined,
    };
  } catch {
    return null;
  }
}

export function buildIndexMarkdown(
  domain: string,
  pages: Array<{
    title: string;
    slug: string;
    url: string;
    wordCount?: number;
    tokenEstimate?: number;
  }>
): string {
  const generatedAt = new Date().toISOString();
  const totalWordCount = pages.reduce((sum, page) => sum + (page.wordCount ?? 0), 0);
  const totalTokenEstimate = pages.reduce(
    (sum, page) => sum + (page.tokenEstimate ?? 0),
    0
  );
  const frontmatter = {
    title: `${domain} Corpus Index`,
    description: `Manifest of scraped Markdown documents for ${domain}.`,
    source_domain: domain.replace(/^www-/, "").replace(/-/g, "."),
    crawled_at: generatedAt,
    document_type: "corpus-index",
    page_count: pages.length,
    total_word_count: totalWordCount,
    total_token_estimate: totalTokenEstimate,
    status: "active",
  };

  const body = [
    `# ${domain} — Corpus Index`,
    "",
    `*Generated: ${generatedAt.slice(0, 10)} | ${pages.length} documents | ~${totalTokenEstimate.toLocaleString()} tokens*`,
    "",
    "## Documents",
    "",
    ...pages.map((page, index) => {
      const stats =
        page.tokenEstimate !== undefined
          ? ` (~${page.tokenEstimate.toLocaleString()} tokens)`
          : "";
      return `${index + 1}. ${page.title || page.slug} — ${page.url}${stats}`;
    }),
    "",
  ].join("\n");

  return matter.stringify(body, frontmatter);
}
