"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useScrapeStore, urlsToPages } from "@/store/scrape-store";

interface ScrapeFormProps {
  onDiscovered?: () => void;
}

export function ScrapeForm({ onDiscovered }: ScrapeFormProps) {
  const {
    baseUrl,
    setBaseUrl,
    settings,
    isDiscovering,
    setDiscovering,
    setPages,
    setDiscoveryMeta,
    resetJob,
  } = useScrapeStore();
  const [error, setError] = useState<string | null>(null);

  async function handleDiscover() {
    setError(null);
    const raw = baseUrl.trim();
    if (!raw) {
      setError("Please enter a website URL.");
      return;
    }

    // Normalize bare domains like "supermicro.com" → "https://supermicro.com"
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (normalized !== raw) setBaseUrl(normalized);

    setDiscovering(true);
    try {
      const response = await fetch("/api/sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized, settings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Discovery failed");

      const pages = urlsToPages(data.urls as string[]);
      setPages(pages);
      setDiscoveryMeta(data.message, data.source, data.domain);
      onDiscovered?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discover Pages</CardTitle>
        <CardDescription>
          Paste a site URL. We&apos;ll locate sitemaps via XML, robots.txt, or a
          limited navigation crawl.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="site-url" className="text-xs uppercase tracking-wider text-muted-foreground">
            Website URL
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="site-url"
              placeholder="https://example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
              className="h-10"
            />
            <Button
              onClick={handleDiscover}
              disabled={isDiscovering}
              className="h-10 px-4 sm:w-auto"
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discovering…
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Discover Sitemap
                </>
              )}
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={resetJob}>
            Reset session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
