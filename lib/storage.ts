"use client";

import { DEFAULT_SETTINGS, STORAGE_KEYS } from "@/lib/constants";
import { normalizeSettings } from "@/lib/settings";
import type { ScrapeHistoryEntry, ScrapeSettings } from "@/lib/types";

export function loadSettings(): ScrapeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw) as Partial<ScrapeSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ScrapeSettings): void {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalizeSettings(settings)));
}

export function loadHistory(): ScrapeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: ScrapeHistoryEntry): void {
  const history = loadHistory();
  const next = [entry, ...history].slice(0, 50);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(next));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEYS.history);
}

export function exportConfig(settings: ScrapeSettings): string {
  return JSON.stringify(normalizeSettings(settings), null, 2);
}

export function importConfig(raw: string): ScrapeSettings {
  const parsed = JSON.parse(raw) as Partial<ScrapeSettings>;
  return normalizeSettings(parsed);
}

export function saveNamedConfig(name: string, settings: ScrapeSettings): void {
  const raw = localStorage.getItem(STORAGE_KEYS.configs);
  const configs: Record<string, ScrapeSettings> = raw ? JSON.parse(raw) : {};
  configs[name] = normalizeSettings(settings);
  localStorage.setItem(STORAGE_KEYS.configs, JSON.stringify(configs));
}

export function loadNamedConfigs(): Record<string, ScrapeSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.configs);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<ScrapeSettings>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([name, config]) => [name, normalizeSettings(config)])
    );
  } catch {
    return {};
  }
}

export function deleteNamedConfig(name: string): void {
  const configs = loadNamedConfigs();
  delete configs[name];
  localStorage.setItem(STORAGE_KEYS.configs, JSON.stringify(configs));
}
