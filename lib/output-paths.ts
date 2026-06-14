import path from "path";
import {
  DEFAULT_OUTPUT_DIR,
  PDF_FILES_SUBDIR,
  PDF_MARKDOWN_SUBDIR,
  domainOutputFolder,
  outputRelativePath,
} from "@/lib/export-path";

function resolveOutputDir(): string {
  return process.env.OUTPUT_DIR ?? process.env.SCRAPE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
}

function usesDefaultOutputDir(): boolean {
  return resolveOutputDir() === DEFAULT_OUTPUT_DIR;
}

/** Absolute path to the scrape output root (respects OUTPUT_DIR env override). */
export function getOutputRoot(): string {
  const dir = resolveOutputDir();
  if (usesDefaultOutputDir()) {
    return path.join(/*turbopackIgnore: true*/ process.cwd(), DEFAULT_OUTPUT_DIR);
  }
  return path.isAbsolute(dir)
    ? dir
    : path.join(/*turbopackIgnore: true*/ process.cwd(), dir);
}

export function getDomainOutputPath(domain: string): string {
  if (usesDefaultOutputDir()) {
    return path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      DEFAULT_OUTPUT_DIR,
      domainOutputFolder(domain)
    );
  }
  return path.join(getOutputRoot(), domainOutputFolder(domain));
}

export function getRelativeOutputPath(domain: string): string {
  return outputRelativePath(domain, resolveOutputDir());
}

export function getPdfFilesDir(domain: string): string {
  if (usesDefaultOutputDir()) {
    return path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      DEFAULT_OUTPUT_DIR,
      domainOutputFolder(domain),
      PDF_FILES_SUBDIR
    );
  }
  return path.join(getDomainOutputPath(domain), PDF_FILES_SUBDIR);
}

export function getPdfMarkdownDir(domain: string): string {
  if (usesDefaultOutputDir()) {
    return path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      DEFAULT_OUTPUT_DIR,
      domainOutputFolder(domain),
      PDF_MARKDOWN_SUBDIR
    );
  }
  return path.join(getDomainOutputPath(domain), PDF_MARKDOWN_SUBDIR);
}

export function getCachedPdfPath(domain: string, pdfFileName: string): string {
  if (usesDefaultOutputDir()) {
    return path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      DEFAULT_OUTPUT_DIR,
      domainOutputFolder(domain),
      PDF_FILES_SUBDIR,
      pdfFileName
    );
  }
  return path.join(getPdfFilesDir(domain), pdfFileName);
}
