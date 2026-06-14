import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { SITEMAP_CANDIDATES } from "@/lib/constants";
import type { ScrapeSettings, SitemapDiscoveryResult } from "@/lib/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function normalizeUrl(base: string, href: string): string | null {
  try {
    const url = new URL(href, base);
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.toString();
  } catch {
    return null;
  }
}

function getOrigin(input: string): URL {
  const url = new URL(input.startsWith("http") ? input : `https://${input}`);
  return url;
}

function matchesPatterns(url: string, settings: ScrapeSettings): boolean {
  const includes = settings.includePatterns
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const excludes = settings.excludePatterns
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (includes.length > 0 && !includes.some((p) => url.includes(p))) {
    return false;
  }
  if (excludes.some((p) => url.includes(p))) {
    return false;
  }
  return true;
}

async function fetchText(
  url: string,
  userAgent: string,
  timeoutMs = 15000
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractLocValues(node: unknown): string[] {
  if (!node) return [];
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(extractLocValues);
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>;
    if (typeof record.loc === "string") return [record.loc];
    if (Array.isArray(record.loc)) return record.loc.filter((v) => typeof v === "string");
    return Object.values(record).flatMap(extractLocValues);
  }
  return [];
}

async function parseSitemapXml(
  xml: string,
  origin: URL,
  userAgent: string,
  visited: Set<string>
): Promise<string[]> {
  const urls: string[] = [];
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return urls;
  }

  const urlset = parsed.urlset as Record<string, unknown> | undefined;
  const sitemapindex = parsed.sitemapindex as Record<string, unknown> | undefined;

  if (urlset?.url) {
    for (const loc of extractLocValues(urlset.url)) {
      const normalized = normalizeUrl(origin.origin, loc);
      if (normalized) urls.push(normalized);
    }
  }

  if (sitemapindex?.sitemap) {
    const sitemaps = extractLocValues(sitemapindex.sitemap);
    for (const loc of sitemaps) {
      const sitemapUrl = normalizeUrl(origin.origin, loc);
      if (!sitemapUrl || visited.has(sitemapUrl)) continue;
      visited.add(sitemapUrl);
      const nestedXml = await fetchText(sitemapUrl, userAgent);
      if (nestedXml) {
        urls.push(...(await parseSitemapXml(nestedXml, origin, userAgent, visited)));
      }
    }
  }

  return urls;
}

async function discoverFromRobots(origin: URL, userAgent: string): Promise<string[]> {
  const robotsUrl = `${origin.origin}/robots.txt`;
  const text = await fetchText(robotsUrl, userAgent);
  if (!text) return [];

  const sitemapUrls = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
    .filter(Boolean);

  const urls: string[] = [];
  const visited = new Set<string>();
  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(origin.origin, sitemapUrl);
    if (!normalized || visited.has(normalized)) continue;
    visited.add(normalized);
    const xml = await fetchText(normalized, userAgent);
    if (xml) {
      urls.push(...(await parseSitemapXml(xml, origin, userAgent, visited)));
    }
  }
  return urls;
}

async function crawlNavigationLinks(
  startUrl: string,
  settings: ScrapeSettings
): Promise<string[]> {
  const origin = getOrigin(startUrl);
  const queue: Array<{ url: string; depth: number }> = [
    { url: origin.origin, depth: 0 },
  ];
  const seen = new Set<string>();
  const found: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > settings.maxCrawlDepth) continue;

    const normalized = normalizeUrl(origin.origin, current.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (!normalized.startsWith(origin.origin)) continue;
    if (!matchesPatterns(normalized, settings)) continue;

    found.push(normalized);

    const html = await fetchText(normalized, settings.userAgent);
    if (!html) continue;

    const $ = cheerio.load(html);
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      const next = normalizeUrl(origin.origin, href);
      if (next && next.startsWith(origin.origin) && !seen.has(next)) {
        queue.push({ url: next, depth: current.depth + 1 });
      }
    });

    if (settings.requestDelayMs > 0) {
      await new Promise((r) => setTimeout(r, settings.requestDelayMs));
    }
  }

  return found;
}

export async function discoverSitemapUrls(
  inputUrl: string,
  settings: ScrapeSettings
): Promise<SitemapDiscoveryResult> {
  const origin = getOrigin(inputUrl);
  const visited = new Set<string>();
  let urls: string[] = [];

  for (const candidate of SITEMAP_CANDIDATES) {
    const sitemapUrl = `${origin.origin}${candidate}`;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    const xml = await fetchText(sitemapUrl, settings.userAgent);
    if (!xml || !xml.includes("<")) continue;
    const parsed = await parseSitemapXml(xml, origin, settings.userAgent, visited);
    if (parsed.length > 0) {
      urls = parsed;
      break;
    }
  }

  if (urls.length === 0) {
    urls = await discoverFromRobots(origin, settings.userAgent);
  }

  if (urls.length === 0 && settings.fallbackCrawl) {
    const crawled = await crawlNavigationLinks(origin.origin, settings);
    return {
      urls: [...new Set(crawled)].filter((u) => matchesPatterns(u, settings)),
      source: "crawl",
      message: "No sitemap found. Discovered pages via limited navigation crawl.",
    };
  }

  const filtered = [...new Set(urls)]
    .filter((u) => u.startsWith(origin.origin))
    .filter((u) => matchesPatterns(u, settings));

  return {
    urls: filtered,
    source: urls.length > 0 ? "sitemap" : "manual",
    message:
      filtered.length > 0
        ? `Discovered ${filtered.length} URLs from sitemap.`
        : "No URLs discovered. Try enabling fallback crawl or check the URL.",
  };
}

export function domainFromUrl(inputUrl: string): string {
  const origin = getOrigin(inputUrl);
  return origin.hostname.replace(/\./g, "-");
}

export function slugFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/|\/$/g, "");
    if (!path) return "index";
    return path
      .replace(/\//g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .slice(0, 120) || "page";
  } catch {
    return "page";
  }
}
