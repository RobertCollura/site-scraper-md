"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { normalizeSettings, persistablePage } from "@/lib/settings";
import type { DiscoveredPage, ScrapeSettings } from "@/lib/types";

interface ScrapeState {
  baseUrl: string;
  domain: string;
  discoveryMessage: string;
  discoverySource: string;
  isDiscovering: boolean;
  isScraping: boolean;
  pages: DiscoveredPage[];
  settings: ScrapeSettings;
  scrapeStartedAt: number | null;
  setBaseUrl: (url: string) => void;
  setSettings: (settings: ScrapeSettings) => void;
  setDiscovering: (value: boolean) => void;
  setScraping: (value: boolean) => void;
  setPages: (pages: DiscoveredPage[]) => void;
  setDiscoveryMeta: (message: string, source: string, domain: string) => void;
  updatePage: (id: string, patch: Partial<DiscoveredPage>) => void;
  /** Apply multiple page patches in a single state update to avoid N re-renders. */
  batchUpdatePages: (updates: Array<{ id: string; patch: Partial<DiscoveredPage> }>) => void;
  togglePage: (id: string) => void;
  toggleAll: (selected: boolean) => void;
  resetJob: () => void;
  setScrapeStartedAt: (ts: number | null) => void;
}

function pageId(url: string): string {
  return btoa(encodeURIComponent(url)).replace(/=/g, "");
}

/**
 * Debounced localStorage adapter for Zustand persist.
 * Collapses rapid consecutive writes (e.g. during scraping) into a single write
 * after a short idle period, preventing main-thread jank from frequent serialisation.
 */
const debouncedRawStorage = (() => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.setItem(name, value);
        timer = null;
      }, 600);
    },
    removeItem: (name: string) => localStorage.removeItem(name),
  };
})();

const debouncedStorage = createJSONStorage(() => debouncedRawStorage);

export const useScrapeStore = create<ScrapeState>()(
  persist(
    (set, get) => ({
      baseUrl: "",
      domain: "",
      discoveryMessage: "",
      discoverySource: "",
      isDiscovering: false,
      isScraping: false,
      pages: [],
      settings: DEFAULT_SETTINGS,
      scrapeStartedAt: null,
      setBaseUrl: (url) => set({ baseUrl: url }),
      setSettings: (settings) => set({ settings: normalizeSettings(settings) }),
      setDiscovering: (value) => set({ isDiscovering: value }),
      setScraping: (value) => set({ isScraping: value }),
      setPages: (pages) => set({ pages, scrapeStartedAt: null }),
      setDiscoveryMeta: (message, source, domain) =>
        set({ discoveryMessage: message, discoverySource: source, domain }),
      updatePage: (id, patch) =>
        set({
          pages: get().pages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }),
      batchUpdatePages: (updates) => {
        const patchMap = new Map(updates.map(({ id, patch }) => [id, patch]));
        set({
          pages: get().pages.map((p) => {
            const patch = patchMap.get(p.id);
            return patch ? { ...p, ...patch } : p;
          }),
        });
      },
      togglePage: (id) =>
        set({
          pages: get().pages.map((p) =>
            p.id === id ? { ...p, selected: !p.selected } : p
          ),
        }),
      toggleAll: (selected) =>
        set({
          pages: get().pages.map((p) => ({ ...p, selected })),
        }),
      resetJob: () =>
        set({
          baseUrl: "",
          domain: "",
          discoveryMessage: "",
          discoverySource: "",
          pages: [],
          isDiscovering: false,
          isScraping: false,
          scrapeStartedAt: null,
        }),
      setScrapeStartedAt: (ts) => set({ scrapeStartedAt: ts }),
    }),
    {
      name: "site-scraper-md:store",
      storage: debouncedStorage,
      partialize: (state) => ({
        settings: state.settings,
        baseUrl: state.baseUrl,
        domain: state.domain,
        pages: state.pages.map(persistablePage),
        discoveryMessage: state.discoveryMessage,
        discoverySource: state.discoverySource,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<ScrapeState> | undefined;
        if (!saved) return current;

        return {
          ...current,
          ...saved,
          settings: normalizeSettings(saved.settings),
          pages: (saved.pages ?? []).map((page) => ({
            ...page,
            status: page.status === "scraping" ? ("pending" as const) : page.status,
          })),
          isDiscovering: false,
          isScraping: false,
          scrapeStartedAt: null,
        };
      },
    }
  )
);

export function urlsToPages(urls: string[]): DiscoveredPage[] {
  return urls.map((url) => ({
    id: pageId(url),
    url,
    title: new URL(url).pathname || url,
    selected: true,
    status: "pending" as const,
  }));
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}
