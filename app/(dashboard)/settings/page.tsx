"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Save, Upload, Zap } from "lucide-react";
import { DEFAULT_SETTINGS, MAX_CONCURRENCY_LIMIT, MAX_LINKED_PDFS_PER_PAGE } from "@/lib/constants";
import {
  deleteNamedConfig,
  exportConfig,
  importConfig,
  loadNamedConfigs,
  loadSettings,
  saveNamedConfig,
  saveSettings,
} from "@/lib/storage";
import { normalizeSettings } from "@/lib/settings";
import { useScrapeStore } from "@/store/scrape-store";
import type { ScrapeSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function useFirecrawlStatus() {
  const [firecrawlActive, setFirecrawlActive] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data: { firecrawl?: boolean }) => setFirecrawlActive(data.firecrawl ?? false))
      .catch(() => setFirecrawlActive(false));
  }, []);
  return firecrawlActive;
}

export default function SettingsPage() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const firecrawlActive = useFirecrawlStatus();

  return (
    <div className="space-y-8">
      <header className="space-y-3 border-b border-border pb-8">
        <h1>Settings</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Tune scraping behavior, rate limits, and export preferences. Save named configs per site.
        </p>
      </header>

      {firecrawlActive !== null && (
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            firecrawlActive
              ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          {firecrawlActive ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Zap className="mt-0.5 size-4 shrink-0" />
          )}
          <div>
            {firecrawlActive ? (
              <>
                <span className="font-semibold">Firecrawl active</span> — JS rendering, smart
                interaction, and markdown extraction are all handled by Firecrawl.
              </>
            ) : (
              <>
                <span className="font-semibold">No Firecrawl key detected</span> — set{" "}
                <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
                  FIRECRAWL_API_KEY
                </code>{" "}
                in{" "}
                <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
                  .env.local
                </code>{" "}
                to enable Firecrawl.{" "}
                <a
                  href="https://firecrawl.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Get a free key →
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {mounted ? <SettingsForm /> : null}
    </div>
  );
}

function SettingsForm() {
  const { setSettings } = useScrapeStore();
  const [draft, setDraft] = useState<ScrapeSettings>(() => loadSettings());
  const [configName, setConfigName] = useState("");
  const [namedConfigs, setNamedConfigs] = useState<Record<string, ScrapeSettings>>(() =>
    loadNamedConfigs()
  );
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateDraft<K extends keyof ScrapeSettings>(key: K, value: ScrapeSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const normalized = normalizeSettings(draft);
    setDraft(normalized);
    saveSettings(normalized);
    setSettings(normalized);
    setMessage("Settings saved.");
  }

  function handleReset() {
    setDraft(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    setMessage("Settings reset to defaults.");
  }

  function handleExport() {
    const blob = new Blob([exportConfig(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "site-scraper-md-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importConfig(String(reader.result));
        setDraft(imported);
        saveSettings(imported);
        setSettings(imported);
        setMessage("Configuration imported.");
      } catch {
        setMessage("Invalid configuration file.");
      }
    };
    reader.readAsText(file);
  }

  function handleSaveNamedConfig() {
    if (!configName.trim()) return;
    saveNamedConfig(configName.trim(), draft);
    setNamedConfigs(loadNamedConfigs());
    setConfigName("");
    setMessage(`Saved preset "${configName.trim()}".`);
  }

  function handleLoadNamedConfig(name: string) {
    const configs = loadNamedConfigs();
    const config = configs[name];
    if (!config) return;
    setDraft(config);
    saveSettings(config);
    setSettings(config);
    setMessage(`Loaded preset "${name}".`);
  }

  return (
    <>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Scraping</CardTitle>
          <CardDescription>Polite defaults with configurable concurrency.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="user-agent">User Agent</Label>
            <Input
              id="user-agent"
              value={draft.userAgent}
              onChange={(e) => updateDraft("userAgent", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delay">Request Delay (ms)</Label>
            <Input
              id="delay"
              type="number"
              min={0}
              value={draft.requestDelayMs}
              onChange={(e) => updateDraft("requestDelayMs", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="concurrency">Max Concurrency</Label>
            <Input
              id="concurrency"
              type="number"
              min={1}
              max={MAX_CONCURRENCY_LIMIT}
              value={draft.maxConcurrency}
              onChange={(e) =>
                updateDraft(
                  "maxConcurrency",
                  Math.min(MAX_CONCURRENCY_LIMIT, Math.max(1, Number(e.target.value)))
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="depth">Max Crawl Depth</Label>
            <Input
              id="depth"
              type="number"
              min={0}
              max={5}
              value={draft.maxCrawlDepth}
              onChange={(e) => updateDraft("maxCrawlDepth", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retries">Max Retries</Label>
            <Input
              id="retries"
              type="number"
              min={0}
              max={5}
              value={draft.maxRetries}
              onChange={(e) => updateDraft("maxRetries", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Firecrawl</CardTitle>
          <CardDescription>
            Control how long Firecrawl waits for JavaScript to settle before capturing content.
            These settings are also used for the static HTTP fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wait-for-ms">JS Wait Time (ms)</Label>
            <Input
              id="wait-for-ms"
              type="number"
              min={0}
              max={30000}
              step={500}
              value={draft.waitForMs}
              onChange={(e) => updateDraft("waitForMs", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              How long to wait after page load for JS to render (Firecrawl <code>waitFor</code>).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scrape-timeout-ms">Scrape Timeout (ms)</Label>
            <Input
              id="scrape-timeout-ms"
              type="number"
              min={5000}
              max={120000}
              step={5000}
              value={draft.scrapeTimeoutMs}
              onChange={(e) => updateDraft("scrapeTimeoutMs", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Maximum time for a single page fetch before timing out.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RAG Output</CardTitle>
          <CardDescription>
            Clean Markdown for LLM retrieval and chunking, with standardized YAML frontmatter
            (title, description, tags, content_hash) and document body structure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.ragOptimized}
              onCheckedChange={(checked) => updateDraft("ragOptimized", checked)}
            />
            <Label>Optimize Markdown for RAG (recommended)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked PDFs</CardTitle>
          <CardDescription>
            Detect PDF download links on scraped pages, download them, extract text to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">output/&#123;domain&#125;/pdfs/</code>,
            and record references in page frontmatter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.downloadLinkedPdfs}
              onCheckedChange={(checked) => updateDraft("downloadLinkedPdfs", checked)}
            />
            <Label>Download linked PDFs and extract text to Markdown</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-pdfs">Max PDFs per page</Label>
            <Input
              id="max-pdfs"
              type="number"
              min={1}
              max={MAX_LINKED_PDFS_PER_PAGE}
              value={draft.maxLinkedPdfsPerPage}
              onChange={(e) =>
                updateDraft(
                  "maxLinkedPdfsPerPage",
                  Math.min(
                    MAX_LINKED_PDFS_PER_PAGE,
                    Math.max(1, Number(e.target.value))
                  )
                )
              }
              disabled={!draft.downloadLinkedPdfs}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.includePdfLinksInPageBody}
              onCheckedChange={(checked) => updateDraft("includePdfLinksInPageBody", checked)}
              disabled={!draft.downloadLinkedPdfs}
            />
            <Label>
              Include PDF URLs in page body (off = frontmatter only, recommended for RAG)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>URL Patterns</CardTitle>
          <CardDescription>
            Scope the crawl to specific path prefixes and skip known non-content paths.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="include">Include Patterns (comma-separated)</Label>
            <Input
              id="include"
              placeholder="/docs/,/blog/"
              value={draft.includePatterns}
              onChange={(e) => updateDraft("includePatterns", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exclude">Exclude Patterns</Label>
            <Input
              id="exclude"
              value={draft.excludePatterns}
              onChange={(e) => updateDraft("excludePatterns", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.fallbackCrawl}
              onCheckedChange={(checked) => updateDraft("fallbackCrawl", checked)}
            />
            <Label>Fallback navigation crawl if no sitemap found</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
          <CardDescription>Export, import, and save named configurations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset Defaults
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Import JSON
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
              }}
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Preset name"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
            />
            <Button variant="outline" onClick={handleSaveNamedConfig}>
              Save Preset
            </Button>
          </div>
          {Object.keys(namedConfigs).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.keys(namedConfigs).map((name) => (
                <div key={name} className="flex items-center gap-1 border border-border px-2 py-1">
                  <Button variant="ghost" size="sm" onClick={() => handleLoadNamedConfig(name)}>
                    {name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      deleteNamedConfig(name);
                      setNamedConfigs(loadNamedConfigs());
                    }}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
