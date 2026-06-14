import { DEFAULT_SETTINGS, MAX_LINKED_PDFS_PER_PAGE } from "@/lib/constants";
import type { DiscoveredPage, ScrapeSettings } from "@/lib/types";

function sanitizeSettings(settings: ScrapeSettings): ScrapeSettings {
  return {
    ...settings,
    maxConcurrency: Math.min(20, Math.max(1, settings.maxConcurrency)),
    maxCrawlDepth: Math.max(0, settings.maxCrawlDepth),
    maxRetries: Math.max(0, settings.maxRetries),
    waitForMs: Math.min(30_000, Math.max(0, settings.waitForMs ?? DEFAULT_SETTINGS.waitForMs)),
    scrapeTimeoutMs: Math.min(
      120_000,
      Math.max(5_000, settings.scrapeTimeoutMs ?? DEFAULT_SETTINGS.scrapeTimeoutMs)
    ),
    maxLinkedPdfsPerPage: Math.min(
      MAX_LINKED_PDFS_PER_PAGE,
      Math.max(1, settings.maxLinkedPdfsPerPage)
    ),
  };
}

/** Merge persisted/partial settings with current defaults (fills new fields, fixes stale saves). */
export function normalizeSettings(
  settings: Partial<ScrapeSettings> | undefined | null
): ScrapeSettings {
  if (!settings) return DEFAULT_SETTINGS;

  // Map legacy Playwright field names to the new unified names
  const legacyAny = settings as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if (merged.waitForMs === undefined && legacyAny.postInteractionDelayMs !== undefined) {
    merged.waitForMs = Number(legacyAny.postInteractionDelayMs);
  }
  if (merged.scrapeTimeoutMs === undefined && legacyAny.playwrightNavigationTimeoutMs !== undefined) {
    merged.scrapeTimeoutMs = Number(legacyAny.playwrightNavigationTimeoutMs);
  }

  return sanitizeSettings(merged);
}

/** Strip heavy scrape payloads before persisting session state to localStorage. */
export function persistablePage(page: DiscoveredPage): DiscoveredPage {
  return {
    id: page.id,
    url: page.url,
    title: page.title,
    selected: page.selected,
    status: page.status,
    slug: page.slug,
    error: page.error,
  };
}
