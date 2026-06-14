/** Default relative path from project root where exported Markdown is written (gitignored). */
export const DEFAULT_OUTPUT_DIR = "output";

export function domainOutputFolder(domain: string): string {
  return domain;
}

export function outputRelativePath(domain: string, rootDir = DEFAULT_OUTPUT_DIR): string {
  return `${rootDir}/${domainOutputFolder(domain)}`;
}

export const PDF_FILES_SUBDIR = "files";
export const PDF_MARKDOWN_SUBDIR = "pdfs";

export function pdfFilesRelativePath(domain: string): string {
  return `${outputRelativePath(domain)}/${PDF_FILES_SUBDIR}`;
}

export function pdfMarkdownRelativePath(domain: string): string {
  return `${outputRelativePath(domain)}/${PDF_MARKDOWN_SUBDIR}`;
}

export function normalizeScrapeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    let normalized = parsed.href;
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}
