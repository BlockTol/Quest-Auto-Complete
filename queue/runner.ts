/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { accountReady } from "../core/account";
import { acceptQuest } from "../core/enroll";
import { settings } from "../core/settings";
import { sleep } from "../core/sleep";
import { getQuest } from "../core/stores";
import { getQuestName, type Quest } from "../core/types";
import { cancelQuest, isAutoStarted, isRunning, onSessionEnded, startQuest } from "../quests/manager";
import { notify } from "../ui/notify";
import { describeEntry, pickNext, pickToAccept, type QueuePreference, type QueueRow } from "./order";
import {
    addToQueue,
    getEntries,
    isQueued,
    isQueueEnabled,
    loadQueue,
    removeFromQueue,
    setAccepting,
    setQueueEnabled as setQueueEnabledStore,
    subscribe
} from "./store";

const SETTLE_MS = 1500;

const ACCEPT_SPACING_MS = 2000;

let active = false;
let busy = false;
let accepting = false;
let hadWork = false;
let acceptPausedUntil = 0;

const pausedIds = new Set<string>();
let pending: ReturnType<typeof setTimeout> | undefined;
let unsubscribers: Array<() => void> = [];

export const getPreference = (): QueuePreference => settings.store.queuePreference === "games" ? "games" : "videos";
export { isQueueEnabled };

export function getRows(): QueueRow[] {
    return getEntries().map(entry => describeEntry(entry, getQuest(entry.questId), isRunning(entry.questId)));
}

export function scheduleTick(delay = 0) {
    if (!active) return;

    clearTimeout(pending);
    pending = setTimeout(() => void tick(), delay);
}

export function setQueueEnabled(enabled: boolean) {
    setQueueEnabledStore(enabled);

    if (enabled) {
        scheduleTick();
        return;
    }

    clearTimeout(pending);
    for (const row of getRows()) {
        const { questId } = row.entry;
        if (row.state !== "running" || !isAutoStarted(questId)) continue;

        pausedIds.add(questId);
        cancelQuest(questId, "Queue paused");

        pausedIds.delete(questId);
    }
}

async function acceptPending() {
    if (accepting) return;

    accepting = true;
    try {
        while (active && isQueueEnabled()) {
            if (Date.now() < acceptPausedUntil) return;

            const row = pickToAccept(getRows(), getPreference());
            if (!row?.quest) return;

            const { questId } = row.entry;
            setAccepting(questId, true);
            const result = await acceptQuest(row.quest);
            setAccepting(questId, false);

            if (!result.ok) {
                notify("Couldn't accept quest", `${getQuestName(row.quest)}: ${result.reason}`, "error");

                if (result.retryAt) {
                    acceptPausedUntil = result.retryAt;
                    scheduleTick(Math.max(0, result.retryAt - Date.now()) + 1000);
                    return;
                }

                removeFromQueue(questId);
            }

            await sleep(ACCEPT_SPACING_MS);
        }
    } finally {
        accepting = false;
    }
}

async function tick() {
    if (!active || busy || !isQueueEnabled() || !accountReady()) return;

    busy = true;
    try {
        for (const row of getRows())
            if (row.state === "unavailable") removeFromQueue(row.entry.questId);

        void acceptPending();

        const rows = getRows();
        if (rows.some(row => row.state === "running")) return;

        const next = pickNext(rows, getPreference());
        if (!next) {
            if (hadWork && getEntries().length === 0) {
                hadWork = false;
                notify("All done", "The queue is empty.", "success");
            }
            return;
        }

        hadWork = true;
        notify("Queue", `Now running: ${getQuestName(next.quest!)}`, "info");

        const result = await startQuest(next.entry.questId, { toggle: false, prompt: false, auto: true });

        if (result === "invalid") {
            removeFromQueue(next.entry.questId);
            scheduleTick();
        }
    } finally {
        busy = false;
    }
}

export async function startQueue() {
    stopQueue();
    active = true;
    hadWork = false;
    acceptPausedUntil = 0;

    await loadQueue();
    if (!active) return;

    unsubscribers = [
        subscribe(() => scheduleTick()),
        onSessionEnded(session => {
            if (!pausedIds.has(session.id)) removeFromQueue(session.id);
            scheduleTick(SETTLE_MS);
        })
    ];

    scheduleTick();
}

export function stopQueue() {
    active = false;
    pausedIds.clear();
    clearTimeout(pending);
    unsubscribers.forEach(unsubscribe => unsubscribe());
    unsubscribers = [];
}

export function toggleQueued(quest: Quest) {
    const name = getQuestName(quest);

    if (isQueued(quest.id)) {
        removeFromQueue(quest.id);
        notify("Queue", `${name} removed`, "info");
        return;
    }

    addToQueue(quest.id);
    notify("Queue", `${name} added`, "info");
}
