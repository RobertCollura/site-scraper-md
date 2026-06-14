import Firecrawl from "firecrawl";
import type { FetchPageResult } from "@/lib/fetch-strategy";
import type { ScrapeSettings } from "@/lib/types";

export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

function buildClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");
  return new Firecrawl({ apiKey });
}

export async function fetchWithFirecrawl(
  url: string,
  settings: ScrapeSettings
): Promise<FetchPageResult> {
  const client = buildClient();

  // scrape() throws on failure in v4 SDK; no success flag to check
  const doc = await client.scrape(url, {
    formats: ["html", "markdown"],
    onlyMainContent: false,
    timeout: settings.scrapeTimeoutMs,
    waitFor: settings.waitForMs,
    mobile: false,
    blockAds: true,
    removeBase64Images: true,
  });

  const html: string = doc.html ?? doc.rawHtml ?? "";
  const markdown: string = doc.markdown ?? "";

  if (!html && !markdown) {
    throw new Error(`Firecrawl returned no content for ${url}`);
  }

  const finalUrl: string =
    doc.metadata?.url ?? doc.metadata?.sourceURL ?? url;

  const extractedTitle: string | undefined =
    doc.metadata?.ogTitle || doc.metadata?.title || undefined;

  return {
    markdown,
    html,
    finalUrl,
    fetchMethod: "firecrawl",
    extractedTitle,
  };
}
