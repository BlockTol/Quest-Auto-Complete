/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../core/settings";

export type Tone = "info" | "success" | "error" | "cancel";
export type PillStatus = "running" | "completed" | "failed" | "incomplete" | "cancelled";

export interface PromptAction {
    label: string;
    variant?: "primary" | "danger";
    onClick(): void;
}

interface ItemBase {
    id: string;

    closing: boolean;
}

export interface PillItem extends ItemBase {
    kind: "pill";
    title: string;
    body: string;
    percent: number;
    status: PillStatus;
    slide: { text: string; tone: Tone; nonce: number; } | null;
    onCancel?: () => void;
}

export interface ToastItem extends ItemBase {
    kind: "toast";
    title: string;
    body: string;
    tone: Tone;
}

export interface PromptItem extends ItemBase {
    kind: "prompt";
    title: string;
    body: string;
    actions: PromptAction[];
}

export type OverlayItem = PillItem | ToastItem | PromptItem;

const EXIT_ANIMATION_MS = 520;
const MAX_TOASTS = 5;

let items: readonly OverlayItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const timers = new Set<ReturnType<typeof setTimeout>>();

function publish(next: readonly OverlayItem[]) {
    items = next;
    listeners.forEach(listener => listener());
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const getItems = () => items;
export const nextId = (prefix: string) => `${prefix}-${++counter}`;
export const pillId = (questId: string) => `quest:${questId}`;
export const durationMs = () => (settings.store.notificationDuration ?? 4) * 1000;

export function findItem<T extends OverlayItem>(id: string, kind: T["kind"]): T | undefined {
    return items.find((item): item is T => item.id === id && item.kind === kind);
}

export function later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
    }, ms);
    timers.add(timer);
}

export function addItem(item: OverlayItem, { front = false } = {}) {
    publish(front ? [item, ...items] : [...items, item]);
}

export function updateItem(id: string, patch: Partial<PillItem> | Partial<ToastItem> | Partial<PromptItem>) {
    publish(items.map(item => item.id === id ? { ...item, ...patch } as OverlayItem : item));
}

export function removeItem(id: string) {
    const item = items.find(i => i.id === id);
    if (!item || item.closing) return;

    updateItem(id, { closing: true });
    later(() => publish(items.filter(i => i.id !== id)), EXIT_ANIMATION_MS);
}

export function removeItemNow(id: string) {
    publish(items.filter(item => item.id !== id));
}

export function makeRoomForToast() {
    const toasts = items.filter(item => item.kind === "toast" && !item.closing);
    if (toasts.length >= MAX_TOASTS) removeItem(toasts[0].id);
}

export function reset() {
    timers.forEach(clearTimeout);
    timers.clear();
    publish([]);
}
