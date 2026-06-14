import { NextResponse } from "next/server";
import { isFirecrawlConfigured } from "@/lib/firecrawl-fetch";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    firecrawl: isFirecrawlConfigured(),
  });
}
