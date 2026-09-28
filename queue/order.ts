/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    isCompleted,
    isEnrolled,
    isExpired,
    isVideoTask,
    pickTask,
    type Quest,
    type TaskType
} from "@plugins/QuestAutoComplete/core/types";

export interface QueueEntry {
    questId: string;
    addedAt: number;
}

export type QueueKind = "video" | "game";
export type QueuePreference = "videos" | "games";

export type RowState = "running" | "ready" | "needs-accept" | "unavailable";

export interface QueueRow {
    entry: QueueEntry;
    quest: Quest | undefined;
    task: TaskType | null;
    kind: QueueKind | null;
    state: RowState;
}

export const kindOf = (task: TaskType): QueueKind => isVideoTask(task) ? "video" : "game";

export function isQueueable(quest: Quest, now = Date.now()): boolean {
    return pickTask(quest) != null && !isCompleted(quest) && !isExpired(quest, now);
}

export function describeEntry(entry: QueueEntry, quest: Quest | undefined, running: boolean, now = Date.now()): QueueRow {
    const task = quest ? pickTask(quest) : null;
    const kind = task ? kindOf(task) : null;

    let state: RowState;
    if (running) state = "running";
    else if (!quest || !task || isCompleted(quest) || isExpired(quest, now)) state = "unavailable";
    else if (!isEnrolled(quest)) state = "needs-accept";
    else state = "ready";

    return { entry, quest, task, kind, state };
}

export function sortRows(rows: readonly QueueRow[], preference: QueuePreference): QueueRow[] {
    const preferred: QueueKind = preference === "games" ? "game" : "video";
    const rank = (row: QueueRow) => (row.state === "running" ? 0 : 10) + (row.kind === preferred ? 0 : row.kind ? 1 : 2);

    return [...rows].sort((a, b) => rank(a) - rank(b) || a.entry.addedAt - b.entry.addedAt);
}

export function pickNext(rows: readonly QueueRow[], preference: QueuePreference): QueueRow | undefined {
    return sortRows(rows.filter(row => row.state === "ready"), preference)[0];
}

export function pickToAccept(rows: readonly QueueRow[], preference: QueuePreference): QueueRow | undefined {
    return sortRows(rows.filter(row => row.state === "needs-accept"), preference)[0];
}
