const BROKEN_LINK_BLOCK =
  /\\?\[\s*(?:\n|\*\[Image:[^\]]*]\*\s*)+\]?\([^)\n]*\)\s*/gi;

const BROKEN_LINK_TAIL = /^\\?\]\([^)\n]+\)\s*$/gm;

const IMAGE_MARKDOWN =
  /!\[[^\]]*]\([^)]*\)|\\?\*\[Image:[^\]]*]\*|^\*\[Image:[^\]]*]\*\s*$/gim;

const GENERIC_CTA_LINK =
  /^\[(?:Show Models?|Show Model|Shop Models?|Watch the|Learn more|Get pricing|Contact us|Apply|Cancel|Close)[^\]]*]\([^)]+\)\s*$/gim;

const NOISE_LINE =
  /^(?:previous|next|resources|video|×clear all|clear all|clear filters?|reset filters?|show models?|show model|shop models?|watch the video|watch now|100%|finalizing…|finalizing\.\.\.|compare\s+\d+\s*\/\s*\d+|open chat|learn more|get pricing|contact us|apply|cancel|close|you can[’']?t perform that action at this time|card view|list view|card view\s*list view|cancel\s*apply|loading products(?:…|\.\.\.)?|filters?|filter by|view as|keyword|showing \d+(?:\s*-\s*\d+)?\s+results|sort by|panel\s+\d+|grp-type-\d+|slick-slide\d+|starting at\s*\$\s*[\d,.]+|(?:white paper|success story|product brief|solution brief|datasheet|brochure|product review))$/i;

/** Concatenated filter facet values like "Mid-Tower (1)Tower/4U (2)1U (21)" */
const FILTER_FACET_LINE = /^(?:[^(\n]+\(\d+\)){2,}\s*$/;

const UI_HEADING_LABELS =
  /^(open chat|resources|filters?|naming conventions|panel\s+\d+|grp-type-\d+|slick-slide\d+)$/i;

export function isUiHeading(heading: string): boolean {
  return UI_HEADING_LABELS.test(heading.trim());
}

const PAGINATION_LINE = /^\*\s+\d+\s*$/;

const MARKDOWN_ARTIFACT_LINE = /^\\?(?:\[|\]|\)|\(\s*$|[\\*]{1,3}\s*$)/;

const DOC_TYPE_FROM_CTA: Record<string, string> = {
  "read the white paper": "White Paper",
  "read the success story": "Success Story",
  "read the product brief": "Product Brief",
  "read the solution brief": "Solution Brief",
  "download the datasheet": "Datasheet",
  "download the brochure": "Brochure",
  "check out the product review": "Product Review",
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeEncoding(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\r\n/g, "\n");
}

function stripResidualHtml(text: string): string {
  return text
    .replace(/<\/?(?:div|span|p|br|a|strong|em|ul|ol|li|table|tr|td|th|section|article|header|footer|nav)[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const IMAGE_LINE = /^\*\\?\[Image:[^\]]*]\*\s*$/gm;

function stripMarkdownArtifacts(text: string): string {
  return text
    .replace(BROKEN_LINK_BLOCK, "")
    .replace(BROKEN_LINK_TAIL, "")
    .replace(IMAGE_MARKDOWN, "")
    .replace(IMAGE_LINE, "")
    .replace(/\[([^\]]+)]\((?:javascript:[^)]+)\)/gi, "$1")
    .replace(/\[([^\]]+)]\(#(?:models|[\w-]+)?\)/gi, "$1")
    .replace(GENERIC_CTA_LINK, "")
    .replace(/\\_/g, "_")
    .replace(/\\([[\]()])/g, "$1");
}

function isNoiseLine(line: string, pageTitle?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length <= 2) return true;
  if (/^\*\\?\[Image:/i.test(trimmed)) return true;
  if (/javascript:/i.test(trimmed)) return true;
  if (/^\\?\]\(/.test(trimmed)) return true;
  if (NOISE_LINE.test(trimmed)) return true;
  if (FILTER_FACET_LINE.test(trimmed)) return true;
  if (PAGINATION_LINE.test(trimmed)) return true;
  if (/^\\?\]\([^)]*\)\s*$/.test(trimmed)) return true;
  if (MARKDOWN_ARTIFACT_LINE.test(trimmed)) return true;
  if (pageTitle && trimmed.toLowerCase() === pageTitle.toLowerCase()) return true;
  return false;
}

function removeNoiseLines(text: string): string {
  const pageTitle = text.match(/^# (.+)$/m)?.[1]?.trim();
  return text
    .split("\n")
    .filter((line) => !isNoiseLine(line, pageTitle))
    .join("\n");
}

function removeUiHeadingLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return true;
      return !isUiHeading(match[2]);
    })
    .join("\n");
}

function flattenSubheadings(text: string): string {
  return text.replace(/^#{4,6}\s+(.+)$/gm, "$1");
}

function dedupeSectionsByTitle(text: string, headingPrefix: "##"): string {
  const parts = text.split(new RegExp(`(?=^${headingPrefix} )`, "m"));
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (!trimmed.startsWith(`${headingPrefix} `)) {
      kept.push(trimmed);
      continue;
    }

    const title = trimmed.match(new RegExp(`^${headingPrefix} (.+)$`, "m"))?.[1]?.trim();
    if (!title) {
      kept.push(trimmed);
      continue;
    }

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
  }

  return kept.join("\n\n");
}

function removeTrailingUiSections(text: string): string {
  return text
    .replace(/\n## Open chat\b[\s\S]*?(?=\n## |\n# |$)/gim, "")
    .replace(/\n## Filters?\b[\s\S]*?(?=\n## |\n# |$)/gim, "")
    .replace(/\n## Naming Conventions\b[\s\S]*?(?=\n## |\n# |$)/gim, "")
    .split("\n")
    .filter((line) => !/^#{1,3}\s+(?:open chat|filters?|naming conventions)\b/i.test(line))
    .join("\n");
}

function removeNamingConventionBlocks(text: string): string {
  return text
    .replace(
      /\n(?:## Available Models\s*\n+)?Naming Conventions\s*\n+(?:[*-]\s+\[[^\]]+]\([^)\n]*Product_Naming_Convention[^)\n]*\)\s*\n?)+/gi,
      "\n"
    )
    .replace(
      /\n## Available Models\s*\n+(?=## |\# |$)/g,
      "\n"
    );
}

function removeUiControlBursts(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^(?:card view\s*list view|cancel\s*apply|loading products(?:…|\.\.\.)?)$/i.test(trimmed)) {
        return false;
      }
      if (/^(?:panel\s+\d+|grp-type-\d+|slick-slide\d+)$/i.test(trimmed)) return false;
      if (/^starting at\s*\$\s*[\d,.]+$/i.test(trimmed)) return false;
      if (/^(?:filters?|filter by|sort by|view as)$/i.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

function isMarkdownTableLine(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line);
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function normalizeMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!isMarkdownTableLine(lines[i])) {
      output.push(lines[i]);
      continue;
    }

    const block: string[] = [];
    while (i < lines.length && isMarkdownTableLine(lines[i])) {
      block.push(lines[i]);
      i += 1;
    }
    i -= 1;

    if (block.length < 3 || !isSeparatorRow(block[1])) {
      output.push(...block);
      continue;
    }

    const header = block[0];
    const separator = block[1];
    const expectedCells = splitTableCells(header).length;
    const normalizedBlock = [header, separator];
    const seenRows = new Set<string>();

    for (let rowIndex = 2; rowIndex < block.length; rowIndex += 1) {
      const row = block[rowIndex];

      if (row === header && isSeparatorRow(block[rowIndex + 1] ?? "")) {
        rowIndex += 1;
        continue;
      }

      if (isSeparatorRow(row)) {
        if (normalizedBlock[normalizedBlock.length - 1] === separator) continue;
        normalizedBlock.push(row);
        continue;
      }

      const cells = splitTableCells(row);
      const nonEmptyCells = cells.filter(Boolean).length;
      if (expectedCells >= 3 && cells.length < expectedCells && nonEmptyCells < expectedCells - 1) {
        continue;
      }

      const fingerprint = cells.join("|").toLowerCase();
      if (seenRows.has(fingerprint)) continue;
      seenRows.add(fingerprint);
      normalizedBlock.push(row);
    }

    output.push(...normalizedBlock);
  }

  return output.join("\n");
}

interface ResourceEntry {
  title: string;
  url: string;
  type: string;
}

function inferDocType(linkLabel: string, block: string): string {
  const label = linkLabel.toLowerCase();
  for (const [key, value] of Object.entries(DOC_TYPE_FROM_CTA)) {
    if (label.includes(key.replace("the ", ""))) return value;
  }

  if (/white paper/i.test(block)) return "White Paper";
  if (/success story/i.test(block)) return "Success Story";
  if (/product brief/i.test(block)) return "Product Brief";
  if (/solution brief/i.test(block)) return "Solution Brief";
  if (/datasheet/i.test(block)) return "Datasheet";
  if (/brochure/i.test(block)) return "Brochure";
  if (/product review/i.test(block)) return "Product Review";
  if (/\.pdf(?:$|[?#])/i.test(block)) return "PDF";
  return "Document";
}

function getResourcesScope(text: string): string {
  const match = text.match(/\nResources\s*\n([\s\S]*?)(?=\n## Available Models|\n#### Naming|\n\* \[|$)/i);
  if (match?.[1]) return match[1];

  const headingMatch = text.match(/\n## Related documents\s*\n([\s\S]*?)$/i);
  if (headingMatch?.[1]) return headingMatch[1];

  return text;
}

function extractResourceEntries(text: string): ResourceEntry[] {
  const scope = getResourcesScope(text);
  const entries: ResourceEntry[] = [];
  const seenUrls = new Set<string>();
  const pattern =
    /^### (.+)\n((?:(?!^### ).*\n)*?)\[(?:Read|Download|Check out)[^\]]+]\(([^)]+)\)/gm;

  for (const match of scope.matchAll(pattern)) {
    const title = match[1].trim();
    const block = match[0];
    const url = match[3].trim();
    const normalizedUrl = url.toLowerCase();

    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

    const linkLabel = block.match(/\[(Read[^\]]+|Download[^\]]+|Check out[^\]]+)\]/i)?.[1] ?? "";
    entries.push({
      title,
      url,
      type: inferDocType(linkLabel, block),
    });
  }

  return entries;
}

function removeResourceBlocks(text: string): string {
  return text.replace(
    /\n(?:## )?Resources\s*\n([\s\S]*?)(?=\n## Available Models|\n#### Naming|\n## [^#]|\n# |$)/i,
    (_match, block: string) => {
      const cleaned = block.replace(
        /^### .+\n(?:.*\n)*?\[(?:Read|Download|Check out)[^\]]+]\([^)]+\)\s*/gm,
        ""
      );
      const trimmed = cleaned.trim();
      return trimmed ? `\n## Resources\n\n${trimmed}\n` : "";
    }
  );
}

function buildRelatedDocumentsSection(entries: ResourceEntry[]): string {
  if (entries.length === 0) return "";

  const lines = entries.map(
    (entry) => `- **${entry.title}** (${entry.type}): ${entry.url}`
  );

  return `## Related documents\n\n${lines.join("\n")}`;
}

function restructureForRag(text: string, resources: ResourceEntry[]): string {
  let body = removeResourceBlocks(text);
  body = removeTrailingUiSections(body);
  body = dedupeSectionsByTitle(body, "##");

  const related = buildRelatedDocumentsSection(resources);
  if (related) {
    body = `${body.trim()}\n\n${related}`;
  }

  return body;
}
function formatProductSections(text: string): string {
  return text.replace(
    /^### (.+)\n((?:(?!^#{1,3} ).*\n)*)/gm,
    (_full, title: string, body: string) => {
      const cleanedBody = body
        .split("\n")
        .filter((line: string) => !/^\*\[Image:/i.test(line.trim()))
        .join("\n")
        .trim();

      if (!cleanedBody) {
        return `### ${title.trim()}\n\n`;
      }

      const specLines = cleanedBody
        .split("\n")
        .filter((line: string) => line.trim().startsWith("* "))
        .join("\n");
      const intro = cleanedBody
        .split("\n")
        .filter((line: string) => {
          const trimmed = line.trim();
          return (
            trimmed &&
            !trimmed.startsWith("* ") &&
            !trimmed.startsWith("[") &&
            !/^\\?\]\(/.test(trimmed)
          );
        })
        .join("\n");

      const parts = [`### ${title.trim()}`];
      if (intro) parts.push(intro);
      if (specLines) parts.push(specLines);
      return `${parts.join("\n\n")}\n\n`;
    }
  );
}

function removeDuplicateParagraphs(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const paragraph of paragraphs) {
    const key = paragraph.replace(/\s+/g, " ").trim().toLowerCase();
    if (key.length < 40) {
      kept.push(paragraph);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(paragraph);
  }

  return kept.join("\n\n");
}

export function optimizeMarkdownForRag(markdown: string): string {
  const resources = extractResourceEntries(markdown);
  let text = normalizeEncoding(markdown);

  text = stripResidualHtml(text);
  text = stripMarkdownArtifacts(text);
  text = removeNoiseLines(text);
  text = removeUiHeadingLines(text);
  text = removeUiControlBursts(text);
  text = flattenSubheadings(text);
  text = restructureForRag(text, resources);
  text = removeNamingConventionBlocks(text);
  text = formatProductSections(text);
  text = normalizeMarkdownTables(text);
  text = removeDuplicateParagraphs(text);
  text = text.replace(BROKEN_LINK_TAIL, "");
  text = removeNoiseLines(text);
  text = removeUiHeadingLines(text);
  text = normalizeWhitespace(text);

  return text;
}

export function markdownPlainText(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#+ .+$/gm, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
