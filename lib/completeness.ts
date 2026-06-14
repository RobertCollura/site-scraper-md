import type { FetchMethod, ScrapeCompletenessReport } from "@/lib/types";

export interface BuildCompletenessReportInput {
  markdown: string;
  title: string;
  fetchMethod: FetchMethod;
}

// ---------------------------------------------------------------------------
// Signal helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countHeadings(markdown: string): number {
  return (markdown.match(/^#{1,6}\s+/gm) ?? []).length;
}

/**
 * Smooth word-volume penalty using a square-root decay curve.
 * Returns 0 at ≥500 words, approaches 40 near 1 word, hard 60 at 0.
 * This avoids hard cliffs between tiers.
 */
function wordVolumePenalty(words: number): number {
  if (words === 0) return 60;
  if (words >= 500) return 0;
  return Math.round(40 * (1 - Math.sqrt(words / 500)));
}

/**
 * Link density: fraction of total words that appear inside markdown link
 * labels [text](url). High density → navigation index, not prose content.
 */
function computeLinkDensity(markdown: string, totalWords: number): number {
  if (totalWords === 0) return 0;
  const linkWordCount = [...markdown.matchAll(/\[([^\]]+)\]\([^)]*\)/g)].reduce(
    (sum, m) => sum + m[1].trim().split(/\s+/).filter(Boolean).length,
    0
  );
  return linkWordCount / totalWords;
}

/**
 * Short line ratio: fraction of non-heading, non-table, non-fence lines
 * containing fewer than 5 words. High ratio signals a navigation list or
 * link dump rather than readable prose.
 */
function computeShortLineRatio(markdown: string): number {
  const lines = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith("#") &&
        !l.startsWith("```") &&
        !l.startsWith("|")
    );
  if (lines.length < 5) return 0;
  const shortLines = lines.filter((l) => l.split(/\s+/).length < 5).length;
  return shortLines / lines.length;
}

/**
 * Duplicate line ratio: fraction of substantive lines (>10 chars) that are
 * exact duplicates. High ratio signals repeated boilerplate blocks.
 */
function computeDuplicateLineRatio(markdown: string): number {
  const lines = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 10);
  if (lines.length < 5) return 0;
  const unique = new Set(lines).size;
  return 1 - unique / lines.length;
}

/**
 * Structural richness score 0–4:
 *   +1  any headings present
 *   +1  three or more distinct headings
 *   +1  unordered or ordered lists present
 *   +1  at least one table row present
 *
 * Used both as a penalty signal (0 = unstructured) and a bonus (≥3 = rich).
 */
function computeStructuralRichness(markdown: string): number {
  let score = 0;
  const headingCount = countHeadings(markdown);
  if (headingCount > 0) score++;
  if (headingCount >= 3) score++;
  if (/^[-*+]\s+/m.test(markdown) || /^\d+\.\s+/m.test(markdown)) score++;
  if (/\|.+\|/m.test(markdown)) score++;
  return score;
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

function buildWarnings(
  title: string,
  fetchMethod: FetchMethod,
  words: number,
  linkDensity: number,
  shortLineRatio: number,
  duplicateRatio: number
): string[] {
  const warnings: string[] = [];

  if (fetchMethod === "static") {
    warnings.push(
      "Static HTTP fetch — JavaScript-rendered content may be missing."
    );
  }

  if (words === 0) {
    warnings.push("No content extracted — page may have failed to render.");
  } else if (words < 50) {
    warnings.push(
      `Very short content (${words} words) — page may be incomplete or blocked.`
    );
  } else if (words < 200) {
    warnings.push(
      `Short content (${words} words) — verify against the live page.`
    );
  }

  if (/\[error/i.test(title) || title === "[Error Title]") {
    warnings.push(
      "Page title suggests a rendering error — content may be incomplete."
    );
  }

  if (linkDensity > 0.6) {
    warnings.push(
      `Very high link density (${Math.round(linkDensity * 100)}% link text) — page is likely a navigation index, not content.`
    );
  } else if (linkDensity > 0.4) {
    warnings.push(
      `High link density (${Math.round(linkDensity * 100)}% link text) — page may be navigation-heavy.`
    );
  }

  if (shortLineRatio > 0.7) {
    warnings.push(
      `Very high short-line ratio (${Math.round(shortLineRatio * 100)}%) — content may be a link dump or menu rather than prose.`
    );
  } else if (shortLineRatio > 0.5) {
    warnings.push(
      `High short-line ratio (${Math.round(shortLineRatio * 100)}%) — content may be list-heavy with little prose.`
    );
  }

  if (duplicateRatio > 0.3) {
    warnings.push(
      `Duplicate line ratio ${Math.round(duplicateRatio * 100)}% — repeated boilerplate blocks detected.`
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

function computeScore(
  title: string,
  words: number,
  linkDensity: number,
  shortLineRatio: number,
  duplicateRatio: number,
  richness: number,
  warnings: string[]
): number {
  let score = 100;

  // 1. Content volume — smooth sqrt decay, not step cliffs
  score -= wordVolumePenalty(words);

  // 2. Link density — strongest boilerplate signal
  if (linkDensity > 0.6) score -= 30;
  else if (linkDensity > 0.4) score -= 15;

  // 3. Short line ratio — prose vs navigation list
  if (shortLineRatio > 0.7) score -= 15;
  else if (shortLineRatio > 0.5) score -= 8;

  // 4. Duplicate lines — repeated boilerplate blocks
  if (duplicateRatio > 0.3) score -= 10;

  // 5. Structural richness (only meaningful when there is enough content)
  if (words > 200) {
    if (richness === 0) score -= 15; // no structure whatsoever
    else if (richness === 1) score -= 5; // headings only, no lists/tables
    else if (richness >= 3) score += 5; // headings + lists + tables = bonus
  }

  // 6. Rendering failure indicated by title
  if (/\[error/i.test(title)) score -= 20;

  // 7. Each warning beyond the first compounds the penalty slightly
  if (warnings.length > 1) score -= (warnings.length - 1) * 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function gradeFromScore(score: number): ScrapeCompletenessReport["grade"] {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

export function buildCompletenessReport(
  input: BuildCompletenessReportInput
): ScrapeCompletenessReport {
  const words = countWords(input.markdown);
  const headings = countHeadings(input.markdown);
  const linkDensity = computeLinkDensity(input.markdown, words);
  const shortLineRatio = computeShortLineRatio(input.markdown);
  const duplicateRatio = computeDuplicateLineRatio(input.markdown);
  const richness = computeStructuralRichness(input.markdown);

  const warnings = buildWarnings(
    input.title,
    input.fetchMethod,
    words,
    linkDensity,
    shortLineRatio,
    duplicateRatio
  );

  const completenessScore = computeScore(
    input.title,
    words,
    linkDensity,
    shortLineRatio,
    duplicateRatio,
    richness,
    warnings
  );

  return {
    fetchMethod: input.fetchMethod,
    contentCharCount: input.markdown.length,
    contentWordCount: words,
    headingCount: headings,
    warnings,
    completenessScore,
    grade: gradeFromScore(completenessScore),
  };
}

export function gradeBadgeVariant(
  grade: ScrapeCompletenessReport["grade"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (grade) {
    case "excellent":
      return "default";
    case "good":
      return "secondary";
    case "fair":
      return "outline";
    case "poor":
      return "destructive";
  }
}
