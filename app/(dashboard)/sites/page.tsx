"use client";

import { useState } from "react";
import { Trash2, Globe } from "lucide-react";
import { clearHistory, loadHistory } from "@/lib/storage";
import type { ScrapeHistoryEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SitesPage() {
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>(() => loadHistory());

  function handleClear() {
    clearHistory();
    setHistory([]);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <h1>Scraped Sites</h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            History of previous scrape sessions stored in your browser.
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" onClick={handleClear}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear History
          </Button>
        )}
      </header>

      {history.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No scrape history yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {history.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>{entry.domain}</CardTitle>
                    <CardDescription>{entry.baseUrl}</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {entry.successCount}/{entry.pageCount} pages
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Scraped {new Date(entry.scrapedAt).toLocaleString()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
