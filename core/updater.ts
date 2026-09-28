/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PLUGIN_VERSION, UPDATE_CHECK_URL } from "./constants";

export interface ReleaseInfo {
    version: string;
    notes: string;
}

export async function fetchLatestRelease(timeoutMs = 10_000): Promise<ReleaseInfo | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(UPDATE_CHECK_URL, {
            signal: controller.signal,
            headers: { Accept: "application/vnd.github.v3+json" }
        });
        if (!res.ok) throw new Error(`GitHub answered with status ${res.status}`);

        const data = await res.json();
        const version = String(data.tag_name || data.name || "").replace(/^v/i, "").trim();

        return version ? { version, notes: String(data.body ?? "") } : null;
    } finally {
        clearTimeout(timer);
    }
}

export function compareVersions(a: string, b: string): number {
    const parse = (v: string) => v.replace(/[^0-9.]/g, "").split(".").map(n => parseInt(n) || 0);
    const left = parse(a);
    const right = parse(b);

    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const diff = (left[i] ?? 0) - (right[i] ?? 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }

    return 0;
}

export const isNewer = (version: string) => compareVersions(version, PLUGIN_VERSION) > 0;

export const isMandatory = (notes: string) => notes.includes("[MANDATORY]");

export function summarizeNotes(notes: string, maxLength = 150): string {
    const plain = notes
        .replace(/\[MANDATORY\]/gi, "")
        .replace(/#{1,6}\s/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/`([^`]*)`/g, "$1")
        .trim();

    return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}...` : plain;
}
