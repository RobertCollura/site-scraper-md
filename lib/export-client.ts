import type { DiscoveredPage, LinkedPdfResult } from "@/lib/types";
import type { LoadPersistedScrapeResult, SaveScrapeResult } from "@/lib/export-server";

export async function savePageToProject(
  domain: string,
  page: DiscoveredPage
): Promise<SaveScrapeResult> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, page }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Save failed");
  return data as SaveScrapeResult;
}

export async function savePagesToProject(
  domain: string,
  pages: DiscoveredPage[]
): Promise<SaveScrapeResult> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, pages }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Save failed");
  return data as SaveScrapeResult;
}

export async function loadPersistedFromDisk(
  domain: string
): Promise<LoadPersistedScrapeResult> {
  const response = await fetch(`/api/export?domain=${encodeURIComponent(domain)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load persisted scrape");
  return data as LoadPersistedScrapeResult;
}

export async function saveLinkedPdfsToProject(
  domain: string,
  linkedPdfs: LinkedPdfResult[]
): Promise<{ savedCount: number; relativePath: string }> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, linkedPdfs }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "PDF save failed");
  return data as { savedCount: number; relativePath: string };
}
