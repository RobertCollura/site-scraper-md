import { NextRequest, NextResponse } from "next/server";
import { normalizeSettings } from "@/lib/settings";
import type { ScrapeSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      domain?: string;
      settings?: Partial<ScrapeSettings>;
    };

    if (!body.url?.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const settings = normalizeSettings(body.settings);

    const { scrapePage } = await import("@/lib/scraper");
    const result = await scrapePage(body.url.trim(), settings, {
      domain: body.domain?.trim(),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
