/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { getOwner, keyFor, loadOwned } from "../core/account";
import { QUEUE_ENABLED_KEY, QUEUE_KEY } from "../core/constants";
import { logger } from "../core/logger";
import { settings } from "../core/settings";
import type { QueueEntry } from "./order";

let entries: readonly QueueEntry[] = [];

let enabled = true;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
    version++;
    listeners.forEach(listener => listener());
}

function save() {
    const key = keyFor(QUEUE_KEY);
    if (!key) return;

    DataStore.set(key, entries).catch(error => logger.warn("Could not save the quest queue", error));
}

function saveEnabled() {
    const key = keyFor(QUEUE_ENABLED_KEY);
    if (!key) return;

    DataStore.set(key, enabled).catch(error => logger.warn("Could not save the queue switch", error));
}

const isEntry = (value: any): value is QueueEntry =>
    typeof value?.questId === "string" && typeof value?.addedAt === "number";

export async function loadQueue() {
    const loadedFor = getOwner();
    let loadedEntries: readonly QueueEntry[] = [];

    let loadedEnabled = settings.store.queueEnabled !== false;

    try {
        const saved = await loadOwned<unknown>(QUEUE_KEY);
        loadedEntries = Array.isArray(saved) ? saved.filter(isEntry) : [];

        const savedEnabled = await loadOwned<boolean>(QUEUE_ENABLED_KEY);
        if (typeof savedEnabled === "boolean") loadedEnabled = savedEnabled;
    } catch (error) {
        logger.warn("Could not load the quest queue", error);
    }

    if (getOwner() !== loadedFor) return;

    entries = loadedEntries;
    enabled = loadedEnabled;
    changed();
}

const accepting = new Set<string>();

export function unloadQueue() {
    entries = [];
    enabled = true;
    accepting.clear();
    changed();
}

export const isQueueEnabled = () => enabled;

export function setQueueEnabled(value: boolean) {
    if (enabled === value) return;

    enabled = value;
    saveEnabled();
    changed();
}

export const isAccepting = (questId: string) => accepting.has(questId);

export function setAccepting(questId: string, value: boolean) {
    if (accepting.has(questId) === value) return;

    if (value) accepting.add(questId);
    else accepting.delete(questId);
    changed();
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const getVersion = () => version;
export const getEntries = () => entries;
export const isQueued = (questId: string) => entries.some(entry => entry.questId === questId);

export function addToQueue(questId: string): boolean {
    if (isQueued(questId)) return false;

    entries = [...entries, { questId, addedAt: Date.now() }];
    save();
    changed();
    return true;
}

export function removeFromQueue(questId: string): boolean {
    if (!isQueued(questId)) return false;

    entries = entries.filter(entry => entry.questId !== questId);
    save();
    changed();
    return true;
}
