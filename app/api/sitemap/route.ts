import { NextRequest, NextResponse } from "next/server";
import { discoverSitemapUrls, domainFromUrl } from "@/lib/sitemap";
import { normalizeSettings } from "@/lib/settings";
import type { ScrapeSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      settings?: Partial<ScrapeSettings>;
    };

    if (!body.url?.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const settings: ScrapeSettings = normalizeSettings(body.settings);

    const result = await discoverSitemapUrls(body.url.trim(), settings);
    const domain = domainFromUrl(body.url.trim());

    return NextResponse.json({
      ...result,
      domain,
      pages: result.urls.map((url) => ({
        url,
        title: new URL(url).pathname || url,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
