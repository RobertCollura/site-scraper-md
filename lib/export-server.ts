import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { buildIndexMarkdown, parsePersistedMarkdownFile } from "@/lib/markdown";
import { normalizeScrapeUrl } from "@/lib/export-path";
import {
  getDomainOutputPath,
  getPdfMarkdownDir,
  getRelativeOutputPath,
} from "@/lib/output-paths";
import type {
  CompletenessGrade,
  DiscoveredPage,
  LinkedPdfResult,
  ScrapeCompletenessReport,
} from "@/lib/types";

const MANIFEST_FILENAME = "manifest.json";

export interface SaveScrapeResult {
  absolutePath: string;
  relativePath: string;
  fileCount: number;
  pageCount: number;
}

export interface ScrapeManifestEntry {
  slug: string;
  url: string;
  title: string;
  scrapedAt: string;
  contentHash?: string;
  wordCount?: number;
  tokenEstimate?: number;
  sectionCount?: number;
  tags?: string[];
  status?: string;
  documentType?: string;
}

export interface ScrapeManifest {
  domain: string;
  updatedAt: string;
  pageCount: number;
  totalWordCount: number;
  totalTokenEstimate: number;
  pages: ScrapeManifestEntry[];
}

export interface PersistedScrapePage {
  slug: string;
  url: string;
  title: string;
  scrapedAt: string;
  markdown: string;
  completenessReport?: ScrapeCompletenessReport;
}

export interface LoadPersistedScrapeResult {
  absolutePath: string;
  relativePath: string;
  pages: PersistedScrapePage[];
  pageCount: number;
}

function manifestPath(domain: string): string {
  return path.join(getDomainOutputPath(domain), MANIFEST_FILENAME);
}

function completenessFromPersisted(
  parsed: NonNullable<ReturnType<typeof parsePersistedMarkdownFile>>
): ScrapeCompletenessReport | undefined {
  if (parsed.completenessScore === undefined) return undefined;

  const grade = (parsed.completenessGrade as CompletenessGrade | undefined) ?? "fair";
  const body = parsed.markdown;

  // Derive metrics from the actual body text rather than stale frontmatter fields
  const contentCharCount = body.length;
  const contentWordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const headingCount = (body.match(/^#{1,6}\s+/gm) ?? []).length;

  return {
    fetchMethod: (parsed.fetchMethod === "firecrawl" ? "firecrawl" : "static") as import("@/lib/types").FetchMethod,
    contentCharCount,
    contentWordCount,
    headingCount,
    warnings: [],
    completenessScore: parsed.completenessScore,
    grade,
  };
}

async function readManifest(domain: string): Promise<ScrapeManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath(domain), "utf8");
    return JSON.parse(raw) as ScrapeManifest;
  } catch {
    return null;
  }
}

async function writeManifest(domain: string, pages: ScrapeManifestEntry[]): Promise<void> {
  const sorted = [...pages].sort((a, b) => a.title.localeCompare(b.title));
  const totalWordCount = sorted.reduce((sum, page) => sum + (page.wordCount ?? 0), 0);
  const totalTokenEstimate = sorted.reduce(
    (sum, page) => sum + (page.tokenEstimate ?? 0),
    0
  );
  const manifest: ScrapeManifest = {
    domain,
    updatedAt: new Date().toISOString(),
    pageCount: sorted.length,
    totalWordCount,
    totalTokenEstimate,
    pages: sorted,
  };
  await fs.writeFile(manifestPath(domain), JSON.stringify(manifest, null, 2), "utf8");
}

async function writeIndex(domain: string, pages: ScrapeManifestEntry[]): Promise<void> {
  const index = buildIndexMarkdown(
    domain,
    pages.map((p) => ({
      title: p.title,
      slug: p.slug,
      url: p.url,
      wordCount: p.wordCount,
      tokenEstimate: p.tokenEstimate,
    }))
  );
  await fs.writeFile(path.join(getDomainOutputPath(domain), "index.md"), index, "utf8");
}

function pageToManifestEntry(page: DiscoveredPage): ScrapeManifestEntry {
  const fallback: ScrapeManifestEntry = {
    slug: page.slug!,
    url: page.url,
    title: page.title,
    scrapedAt: new Date().toISOString(),
  };

  if (!page.markdown) {
    return fallback;
  }

  try {
    const { data } = matter(page.markdown);
    const entry: ScrapeManifestEntry = {
      slug: page.slug!,
      url: typeof data.url === "string" ? data.url : page.url,
      title: typeof data.title === "string" ? data.title : page.title,
      scrapedAt:
        typeof data.crawled_at === "string" ? data.crawled_at : fallback.scrapedAt,
    };

    if (typeof data.content_hash === "string") {
      entry.contentHash = data.content_hash;
    }
    if (typeof data.word_count === "number") {
      entry.wordCount = data.word_count;
    }
    if (typeof data.token_estimate === "number") {
      entry.tokenEstimate = data.token_estimate;
    }
    if (typeof data.section_count === "number") {
      entry.sectionCount = data.section_count;
    }
    if (Array.isArray(data.tags)) {
      entry.tags = data.tags.filter((tag): tag is string => typeof tag === "string");
    }
    if (typeof data.status === "string") {
      entry.status = data.status;
    }
    if (typeof data.document_type === "string") {
      entry.documentType = data.document_type;
    }

    return entry;
  } catch {
    return fallback;
  }
}

function normalizeUrl(url: string): string {
  return normalizeScrapeUrl(url);
}

export async function savePageToDisk(
  domain: string,
  page: DiscoveredPage
): Promise<SaveScrapeResult> {
  if (page.status !== "done" || !page.markdown || !page.slug) {
    throw new Error("Page must be completed with markdown and slug before saving.");
  }

  const folderPath = getDomainOutputPath(domain);
  await fs.mkdir(folderPath, { recursive: true });

  await fs.writeFile(
    path.join(folderPath, `${page.slug}.md`),
    page.markdown,
    "utf8"
  );

  const existing = (await readManifest(domain))?.pages ?? [];
  const entry = pageToManifestEntry(page);
  const nextPages = [
    ...existing.filter(
      (p) => p.slug !== entry.slug && normalizeUrl(p.url) !== normalizeUrl(entry.url)
    ),
    entry,
  ];

  await writeManifest(domain, nextPages);
  await writeIndex(domain, nextPages);

  return {
    absolutePath: folderPath,
    relativePath: getRelativeOutputPath(domain),
    fileCount: nextPages.length + 1,
    pageCount: nextPages.length,
  };
}

export async function saveScrapeToDisk(
  domain: string,
  pages: DiscoveredPage[]
): Promise<SaveScrapeResult> {
  const completed = pages.filter((p) => p.status === "done" && p.markdown && p.slug);

  if (completed.length === 0) {
    throw new Error("No completed pages to save.");
  }

  let lastResult: SaveScrapeResult | null = null;
  for (const page of completed) {
    lastResult = await savePageToDisk(domain, page);
  }

  return lastResult!;
}

export async function loadPersistedScrape(domain: string): Promise<LoadPersistedScrapeResult> {
  const folderPath = getDomainOutputPath(domain);

  let entries: ScrapeManifestEntry[] = [];
  const manifest = await readManifest(domain);
  if (manifest?.pages.length) {
    entries = manifest.pages;
  } else {
    try {
      const files = await fs.readdir(folderPath);
      for (const file of files) {
        if (!file.endsWith(".md") || file === "index.md") continue;
        const slug = file.replace(/\.md$/, "");
        const raw = await fs.readFile(path.join(folderPath, file), "utf8");
        const parsed = parsePersistedMarkdownFile(slug, raw);
        if (!parsed) continue;
        entries.push({
          slug: parsed.slug,
          url: parsed.url,
          title: parsed.title,
          scrapedAt: parsed.scrapedAt,
        });
      }
    } catch {
      entries = [];
    }
  }

  const pages: PersistedScrapePage[] = [];

  for (const entry of entries) {
    try {
      const raw = await fs.readFile(
        path.join(folderPath, `${entry.slug}.md`),
        "utf8"
      );
      const parsed = parsePersistedMarkdownFile(entry.slug, raw);
      if (!parsed) continue;

      pages.push({
        slug: parsed.slug,
        url: parsed.url,
        title: parsed.title,
        scrapedAt: parsed.scrapedAt,
        markdown: parsed.markdown,
        completenessReport: completenessFromPersisted(parsed),
      });
    } catch {
      continue;
    }
  }

  return {
    absolutePath: folderPath,
    relativePath: getRelativeOutputPath(domain),
    pages,
    pageCount: pages.length,
  };
}

export async function saveLinkedPdfsToDisk(
  domain: string,
  linkedPdfs: LinkedPdfResult[]
): Promise<{ savedCount: number; relativePath: string }> {
  const successful = linkedPdfs.filter((pdf) => pdf.markdown && !pdf.error);
  if (successful.length === 0) {
    return { savedCount: 0, relativePath: getRelativeOutputPath(domain) };
  }

  const markdownDir = getPdfMarkdownDir(domain);
  await fs.mkdir(markdownDir, { recursive: true });

  for (const pdf of successful) {
    await fs.writeFile(path.join(markdownDir, `${pdf.slug}.md`), pdf.markdown, "utf8");
  }

  return {
    savedCount: successful.length,
    relativePath: getRelativeOutputPath(domain),
  };
}
