import * as cheerio from "cheerio";

export interface PdfLinkCandidate {
  href: string;
  label: string;
  resolvedPdfUrl: string;
}

const PDF_PATH_PATTERN = /\.pdf($|[?#])/i;

function looksLikePdfPath(value: string): boolean {
  return PDF_PATH_PATTERN.test(value);
}

export function resolvePdfDownloadUrl(href: string, pageUrl: string): string | null {
  try {
    const absolute = new URL(href, pageUrl);
    absolute.hash = "";

    const nestedUrl = absolute.searchParams.get("url");
    if (nestedUrl && looksLikePdfPath(nestedUrl)) {
      return new URL(nestedUrl, absolute.origin).href;
    }

    if (looksLikePdfPath(absolute.pathname + absolute.search)) {
      return absolute.href;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractPdfLinksFromHtml(html: string, pageUrl: string): PdfLinkCandidate[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: PdfLinkCandidate[] = [];

  function addCandidate(href: string | undefined, label: string) {
    if (!href?.trim()) return;
    const resolved = resolvePdfDownloadUrl(href.trim(), pageUrl);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    links.push({
      href: href.trim(),
      label: label.trim() || resolved,
      resolvedPdfUrl: resolved,
    });
  }

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const label = $(el).text().replace(/\s+/g, " ").trim();
    addCandidate(href, label);
  });

  $("[href]").each((_, el) => {
    if (el.tagName === "a") return;
    const href = $(el).attr("href");
    addCandidate(href, $(el).text().replace(/\s+/g, " ").trim());
  });

  return links;
}

export function pdfSlugFromUrl(pdfUrl: string): string {
  try {
    const parsed = new URL(pdfUrl);
    const base = parsed.pathname.split("/").pop() ?? "document";
    const withoutExt = base.replace(/\.pdf$/i, "");
    const slug = withoutExt.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "");
    return slug.slice(0, 80) || "document";
  } catch {
    return "document";
  }
}

export function pdfTitleFromUrl(pdfUrl: string, label?: string): string {
  if (label && label.length > 2 && !looksLikePdfPath(label)) {
    return label.slice(0, 120);
  }

  try {
    const parsed = new URL(pdfUrl);
    const filename = parsed.pathname.split("/").pop() ?? "Document";
    return filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "PDF Document";
  } catch {
    return "PDF Document";
  }
}
