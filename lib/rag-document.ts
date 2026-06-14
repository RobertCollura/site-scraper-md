import { createHash } from "crypto";
import type { CheerioAPI } from "cheerio";
import type { RelatedPdfReference, ScrapeCompletenessReport } from "@/lib/types";
import { markdownPlainText, isUiHeading } from "@/lib/rag-markdown";

export interface RagChunkSection {
  heading: string;
  level: number;
  word_count: number;
  token_estimate: number;
}

export interface RagPageMetadata {
  title: string;
  description: string;
  url: string;
  sourceDomain: string;
  crawledAt: string;
  lastUpdated?: string;
  tags: string[];
  wordCount: number;
  tokenEstimate: number;
  contentHash: string;
  embedText: string;
  chunkSections: RagChunkSection[];
}

const TAG_STOPWORDS = new Set([
  "en",
  "www",
  "index",
  "html",
  "php",
  "cfm",
  "asp",
  "aspx",
  "page",
  "home",
]);

export function cleanPageTitle(title: string): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  // Strip site suffix after | or spaced em/en dashes; avoid splitting words like "High-End".
  const cleaned = trimmed
    .replace(/\s*[|]\s*.+$/, "")
    .replace(/\s+[–—]\s*.+$/, "")
    .replace(/\s+-\s+.+$/, "")
    .trim();
  return cleaned || trimmed;
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function extractChunkSections(body: string): RagChunkSection[] {
  const lines = body.split("\n");
  const sections: RagChunkSection[] = [];
  let current: RagChunkSection | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!current) return;
    const plain = markdownPlainText(buffer.join("\n"));
    current.word_count = countWords(plain);
    current.token_estimate = estimateTokens(plain);
    if (current.word_count >= 5) {
      sections.push(current);
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      flush();
      const heading = match[2].trim();
      if (isUiHeading(heading)) {
        current = null;
        continue;
      }
      current = {
        heading,
        level: match[1].length,
        word_count: 0,
        token_estimate: 0,
      };
      continue;
    }
    buffer.push(line);
  }

  flush();
  return sections;
}

export function countWords(text: string): number {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return 0;
  return plain.split(" ").length;
}

export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseDateToYmd(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function extractDescription($: CheerioAPI, body: string): string {
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="twitter:description"]').attr("content")?.trim();

  if (metaDescription && metaDescription.length > 20) {
    return metaDescription.replace(/\s+/g, " ").slice(0, 320);
  }

  const firstParagraph = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("*") && line.length > 40);

  if (firstParagraph) {
    return firstParagraph.replace(/\s+/g, " ").slice(0, 320);
  }

  const heading = body.match(/^#{1,3}\s+(.+)$/m)?.[1];
  return heading?.trim() || "Scraped page content.";
}

function extractLastUpdated($: CheerioAPI): string | undefined {
  const candidates = [
    $('meta[property="article:modified_time"]').attr("content"),
    $('meta[property="og:updated_time"]').attr("content"),
    $('meta[name="last-modified"]').attr("content"),
    $('meta[name="dcterms.modified"]').attr("content"),
    $("time[datetime]").first().attr("datetime"),
  ];

  for (const value of candidates) {
    if (!value) continue;
    const parsed = parseDateToYmd(value);
    if (parsed) return parsed;
  }

  return undefined;
}

export function tagsFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.replace(/\.[a-z0-9]+$/i, "").trim())
      .filter((segment) => segment.length > 1)
      .filter((segment) => !TAG_STOPWORDS.has(segment.toLowerCase()))
      .map((segment) => segment.toLowerCase());

    return [...new Set(segments)].slice(0, 8);
  } catch {
    return [];
  }
}

export function buildEmbedText(title: string, description: string, body: string): string {
  const headings = body
    .split("\n")
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#+\s+/, "").trim())
    .filter((heading) => !isUiHeading(heading))
    .slice(0, 12);

  return [title, description, ...headings].filter(Boolean).join(" | ").slice(0, 1500);
}

export function extractPageMetadata(
  $: CheerioAPI,
  options: {
    title: string;
    url: string;
    crawledAt: string;
    body: string;
  }
): RagPageMetadata {
  const title = cleanPageTitle(options.title);
  const plainBody = markdownPlainText(options.body);
  const description = extractDescription($, options.body);
  const sourceDomain = new URL(options.url).hostname;

  return {
    title,
    description,
    url: options.url,
    sourceDomain,
    crawledAt: options.crawledAt,
    lastUpdated: extractLastUpdated($),
    tags: tagsFromUrl(options.url),
    wordCount: countWords(plainBody),
    tokenEstimate: estimateTokens(plainBody),
    contentHash: hashContent(plainBody),
    embedText: buildEmbedText(title, description, options.body),
    chunkSections: extractChunkSections(options.body),
  };
}

export function buildRagDocumentBody(options: {
  title: string;
  url: string;
  crawledAt: string;
  body: string;
}): string {
  const title = cleanPageTitle(options.title);
  let content = options.body.trim();

  content = content.replace(/^#\s+.+\n+/, "");

  const crawledDate = options.crawledAt.slice(0, 10);
  const sourceLine = `*Source: [Original URL](${options.url}) | Crawled: ${crawledDate}*`;

  return `# ${title}\n\n${sourceLine}\n\n${content}`.trim();
}

export interface RagFrontmatterInput extends RagPageMetadata {
  status?: string;
  completenessReport?: ScrapeCompletenessReport;
  documentType?: "web-page" | "pdf-extract";
  pdfUrl?: string;
  sourcePageUrl?: string;
  pdfPages?: number;
  relatedPdfs?: RelatedPdfReference[];
}

export function buildRagFrontmatter(
  metadata: RagFrontmatterInput
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    title: metadata.title,
    description: metadata.description,
    url: metadata.url,
    source_domain: metadata.sourceDomain,
    crawled_at: metadata.crawledAt,
    tags: metadata.tags,
    word_count: metadata.wordCount,
    token_estimate: metadata.tokenEstimate,
    status: metadata.status ?? "active",
    content_hash: metadata.contentHash,
    embed_text: metadata.embedText,
  };

  if (metadata.chunkSections.length > 0) {
    frontmatter.section_count = metadata.chunkSections.length;
    frontmatter.chunk_sections = metadata.chunkSections.map((section) => ({
      heading: section.heading,
      level: section.level,
      word_count: section.word_count,
      token_estimate: section.token_estimate,
    }));
  }

  if (metadata.lastUpdated) {
    frontmatter.last_updated = metadata.lastUpdated;
  }

  if (metadata.documentType) {
    frontmatter.document_type = metadata.documentType;
  }

  if (metadata.pdfUrl) {
    frontmatter.pdf_url = metadata.pdfUrl;
  }

  if (metadata.sourcePageUrl) {
    frontmatter.source_page_url = metadata.sourcePageUrl;
  }

  if (metadata.pdfPages !== undefined) {
    frontmatter.pdf_pages = metadata.pdfPages;
  }

  if (metadata.relatedPdfs?.length) {
    frontmatter.related_pdfs = metadata.relatedPdfs;
  }

  if (metadata.completenessReport) {
    const report = metadata.completenessReport;
    frontmatter.completeness_score = report.completenessScore;
    frontmatter.completeness_grade = report.grade;
    frontmatter.fetch_method = report.fetchMethod;
  }

  return frontmatter;
}
