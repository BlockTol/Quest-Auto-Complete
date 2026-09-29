/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../core/settings";
import type { Outcome, SessionUI } from "../quests/session";
import { notify } from "./notify";
import {
    addItem,
    durationMs,
    findItem,
    later,
    nextId,
    pillId,
    type PillItem,
    removeItem,
    removeItemNow,
    type Tone,
    updateItem
} from "./store";

const toneOf: Record<Outcome, Tone> = {
    completed: "success",
    failed: "error",
    incomplete: "info",
    cancelled: "cancel"
};

const titleOf: Record<Outcome, string> = {
    completed: "Quest Completed",
    failed: "Quest Error",
    incomplete: "Progress Saved",
    cancelled: "Quest Cancelled"
};

export function createSessionUI(cancel: (questId: string) => void): SessionUI {
    return {
        started(session) {
            if (!settings.store.showProgressBar) return;

            removeItemNow(pillId(session.id));
            addItem({
                kind: "pill",
                id: pillId(session.id),
                closing: false,
                title: session.name,
                body: "Initializing...",
                percent: 0,
                status: "running",
                slide: null,
                onCancel: () => cancel(session.id)
            }, { front: true });
        },

        progress(session, percent) {
            if (findItem(pillId(session.id), "pill")) updateItem(pillId(session.id), { percent });
        },

        message(session, text) {
            if (findItem(pillId(session.id), "pill")) updateItem(pillId(session.id), { body: text });
        },

        finished(session, outcome, text) {
            const id = pillId(session.id);
            const pill = findItem<PillItem>(id, "pill");

            if (!pill) {
                notify(titleOf[outcome], text, toneOf[outcome]);
                return;
            }

            updateItem(id, {
                status: outcome,
                title: text,
                percent: outcome === "completed" ? 100 : pill.percent,
                slide: null,
                onCancel: undefined
            });
            later(() => removeItem(id), durationMs());
        }
    };
}

const openPrompts = new Set<() => void>();

export function dismissPrompts() {
    [...openPrompts].forEach(keep => keep());
}

export function confirmSwitch(runningName: string, newName: string): Promise<boolean> {
    return new Promise(resolve => {
        const id = nextId("prompt");
        let settled = false;

        const settle = (value: boolean) => {
            if (settled) return;
            settled = true;
            openPrompts.delete(keep);
            removeItem(id);
            resolve(value);
        };
        const keep = () => settle(false);
        openPrompts.add(keep);

        addItem({
            kind: "prompt",
            id,
            closing: false,
            title: "Quest already running",
            body: `"${runningName}" is being automated. Only one game or stream quest can run at a time. Cancel it and start "${newName}" instead?`,
            actions: [
                { label: "Keep current", onClick: () => settle(false) },
                { label: "Switch quest", variant: "primary", onClick: () => settle(true) }
            ]
        });

        later(() => settle(false), 30_000);
    });
}
