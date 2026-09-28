/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getQuestName, percentOf, type Quest, type TaskType } from "@plugins/QuestAutoComplete/core/types";

export type Outcome = "completed" | "cancelled" | "failed" | "incomplete";

export interface SessionUI {
    started(session: QuestSession): void;
    progress(session: QuestSession, percent: number): void;
    message(session: QuestSession, text: string): void;
    finished(session: QuestSession, outcome: Outcome, text: string): void;
}

function runSafely(fn: () => void) {
    try {
        fn();
    } catch (error) {
        console.error("[QuestAutoComplete] cleanup failed", error);
    }
}

export class QuestSession {
    readonly id: string;
    readonly name: string;

    private readonly controller = new AbortController();
    private readonly cleanups: Array<() => void> = [];
    private finished = false;
    private currentPercent = 0;

    constructor(
        readonly quest: Quest,
        readonly task: TaskType,
        readonly target: number,
        private readonly ui: SessionUI,
        private readonly onEnd: (session: QuestSession, outcome: Outcome) => void
    ) {
        this.id = quest.id;
        this.name = getQuestName(quest);
    }

    get signal() {
        return this.controller.signal;
    }

    get active() {
        return !this.finished;
    }

    get percent() {
        return this.currentPercent;
    }

    start() {
        this.ui.started(this);
    }

    onCleanup(fn: () => void) {
        if (this.finished) runSafely(fn);
        else this.cleanups.push(fn);
    }

    setProgress(percent: number) {
        if (this.finished) return;

        const next = Math.max(0, Math.min(100, Math.floor(percent)));
        if (next === this.currentPercent) return;

        this.currentPercent = next;
        this.ui.progress(this, next);
    }

    setProgressFrom(value: number) {
        this.setProgress(percentOf(value, this.target));
    }

    say(text: string) {
        if (!this.finished) this.ui.message(this, text);
    }

    end(outcome: Outcome, text: string) {
        if (this.finished) return;
        this.finished = true;

        this.controller.abort();
        for (const fn of this.cleanups.splice(0).reverse()) runSafely(fn);

        try {
            this.ui.finished(this, outcome, text);
        } finally {
            this.onEnd(this, outcome);
        }
    }

    complete(text = `${this.name} Completed!`) {
        this.end("completed", text);
    }

    fail(text: string) {
        this.end("failed", text);
    }

    cancel(text = "Quest Cancelled") {
        this.end("cancelled", text);
    }
}
