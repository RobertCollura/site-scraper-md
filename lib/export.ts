import JSZip from "jszip";
import { buildIndexMarkdown } from "@/lib/markdown";
import type { DiscoveredPage } from "@/lib/types";

export async function createScrapeZip(
  domain: string,
  pages: DiscoveredPage[]
): Promise<Blob> {
  const zip = new JSZip();
  const folderName = domain;
  const folder = zip.folder(folderName);
  if (!folder) throw new Error("Failed to create ZIP folder");

  const completed = pages.filter((p) => p.status === "done" && p.markdown && p.slug);

  for (const page of completed) {
    folder.file(`${page.slug}.md`, page.markdown!);
  }

  const index = buildIndexMarkdown(
    domain,
    completed.map((p) => ({
      title: p.title,
      slug: p.slug!,
      url: p.url,
    }))
  );
  folder.file("index.md", index);

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

