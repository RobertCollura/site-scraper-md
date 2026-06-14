import { NextRequest, NextResponse } from "next/server";
import type { DiscoveredPage, LinkedPdfResult } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const domain = request.nextUrl.searchParams.get("domain")?.trim();
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const { loadPersistedScrape } = await import("@/lib/export-server");
    const result = await loadPersistedScrape(domain);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      domain?: string;
      pages?: DiscoveredPage[];
      page?: DiscoveredPage;
      linkedPdfs?: LinkedPdfResult[];
    };

    if (!body.domain?.trim()) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const domain = body.domain.trim();
    const { saveLinkedPdfsToDisk, savePageToDisk, saveScrapeToDisk } = await import(
      "@/lib/export-server"
    );

    if (body.linkedPdfs?.length) {
      const pdfResult = await saveLinkedPdfsToDisk(domain, body.linkedPdfs);
      return NextResponse.json(pdfResult);
    }

    if (body.page) {
      const result = await savePageToDisk(domain, body.page);
      return NextResponse.json(result);
    }

    if (!body.pages?.length) {
      return NextResponse.json({ error: "Pages are required" }, { status: 400 });
    }

    const result = await saveScrapeToDisk(domain, body.pages);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
