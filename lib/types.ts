export type PageStatus = "pending" | "scraping" | "done" | "error";

export type CompletenessGrade = "excellent" | "good" | "fair" | "poor";
export type FetchMethod = "static" | "firecrawl";

export interface ScrapeCompletenessReport {
  fetchMethod: FetchMethod;
  contentCharCount: number;
  contentWordCount: number;
  headingCount: number;
  completenessScore: number;
  grade: CompletenessGrade;
  warnings: string[];
}

export interface DiscoveredPage {
  id: string;
  url: string;
  title: string;
  selected: boolean;
  status: PageStatus;
  error?: string;
  markdown?: string;
  slug?: string;
  completenessReport?: ScrapeCompletenessReport;
}

export interface ScrapeSettings {
  userAgent: string;
  requestDelayMs: number;
  maxConcurrency: number;
  maxCrawlDepth: number;
  maxRetries: number;
  includePatterns: string;
  excludePatterns: string;
  fallbackCrawl: boolean;
  /** How long to wait for JS to render before capturing (ms). Used as Firecrawl waitFor. */
  waitForMs: number;
  /** Page fetch timeout (ms). Used as Firecrawl timeout. */
  scrapeTimeoutMs: number;
  /** Optimize Markdown for LLM RAG, embeddings, and chunking */
  ragOptimized: boolean;
  /** Download PDF links found on scraped pages and extract text to Markdown */
  downloadLinkedPdfs: boolean;
  /** Max PDF links to process per HTML page */
  maxLinkedPdfsPerPage: number;
  /** Include PDF link index in page body (off = frontmatter only, better for RAG chunking) */
  includePdfLinksInPageBody: boolean;
}


export interface SitemapDiscoveryResult {
  urls: string[];
  source: "sitemap" | "robots" | "crawl" | "manual";
  message: string;
}

export interface ScrapePageResult {
  url: string;
  title: string;
  slug: string;
  markdown: string;
  scrapedAt: string;
  completenessReport: ScrapeCompletenessReport;
  linkedPdfs?: LinkedPdfResult[];
}

export interface LinkedPdfResult {
  slug: string;
  title: string;
  pdfUrl: string;
  sourcePageUrl: string;
  markdown: string;
  pdfFileName: string;
  pageCount: number;
  charCount: number;
  skipped?: boolean;
  error?: string;
}

export interface RelatedPdfReference {
  title: string;
  slug: string;
  pdf_url: string;
}

export interface ScrapeHistoryEntry {
  id: string;
  domain: string;
  baseUrl: string;
  scrapedAt: string;
  pageCount: number;
  successCount: number;
  config: ScrapeSettings;
}
