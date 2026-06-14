import type { ScrapeSettings } from "@/lib/types";

export const APP_NAME = "Site Scraper MD";

export const DEFAULT_SETTINGS: ScrapeSettings = {
  userAgent:
    "SiteScraperMD/1.0 (+https://github.com/site-scraper-md; respectful scraper)",
  requestDelayMs: 600,
  maxConcurrency: 2,
  maxCrawlDepth: 3,
  maxRetries: 3,
  includePatterns: "",
  excludePatterns:
    "/tag/,/author/,/wp-json/,/feed/,?replytocom=,/login,/cart,/mysupermicro,/search?",
  fallbackCrawl: true,
  /** waitFor: how long Firecrawl waits for JS to settle (ms) */
  waitForMs: 3000,
  /** scrapeTimeoutMs: max time for the full page fetch (ms) */
  scrapeTimeoutMs: 60000,
  ragOptimized: true,
  downloadLinkedPdfs: true,
  maxLinkedPdfsPerPage: 100,
  includePdfLinksInPageBody: false,
};

export const SITEMAP_CANDIDATES = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
  "/sitemaps/sitemap.xml",
  "/sitemap1.xml",
  "/post-sitemap.xml",
  "/page-sitemap.xml",
];

export const STORAGE_KEYS = {
  settings: "site-scraper-md:settings",
  history: "site-scraper-md:history",
  configs: "site-scraper-md:configs",
} as const;

export const MAX_CONCURRENCY_LIMIT = 20;
export const MAX_LINKED_PDFS_PER_PAGE = 100;
