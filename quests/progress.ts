/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { progressOf, type QuestUserStatus } from "@plugins/QuestAutoComplete/core/types";

import type { QuestDeps } from "./contracts";
import type { QuestSession } from "./session";

export interface WaitOptions {
    stallMs: number;

    graceMs: number;
}

export function waitForServerProgress(session: QuestSession, deps: QuestDeps, options: WaitOptions): Promise<void> {
    const { id, task, target, quest } = session;

    return new Promise<void>((resolve, reject) => {
        const startedAt = deps.now();
        const startProgress = progressOf(deps.getQuest(id)?.userStatus ?? quest.userStatus, task);
        let best = startProgress;
        let lastAdvance = startedAt;
        let advanced = false;

        const evaluate = (eventStatus?: QuestUserStatus) => {
            if (!session.active) return;

            const live = deps.getQuest(id);
            const confirmed = Math.max(progressOf(live?.userStatus, task), progressOf(eventStatus, task));
            const now = deps.now();

            if (confirmed > best) {
                best = confirmed;
                lastAdvance = now;
                advanced = true;
            }

            if (best >= target || live?.userStatus?.completedAt != null || eventStatus?.completedAt != null) {
                session.setProgress(100);
                resolve();
                return;
            }

            if (now - lastAdvance > (advanced ? options.stallMs : options.graceMs)) {
                reject(new Error("Discord stopped counting progress for this quest. Try again."));
                return;
            }

            const estimate = Math.max(best, startProgress + Math.floor((now - startedAt) / 1000));
            session.setProgressFrom(Math.min(estimate, target - 1));
        };

        session.onCleanup(deps.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", event => {
            if (event?.questId === id) evaluate(event.userStatus);
        }));
        session.onCleanup(deps.subscribe("QUESTS_SEND_HEARTBEAT_FAILURE", event => {
            if (event?.questId === id || event?.questId == null) deps.warn("Discord rejected a quest heartbeat", event?.error);
        }));

        const ticker = setInterval(evaluate, 1000);
        session.onCleanup(() => clearInterval(ticker));

        session.signal.addEventListener("abort", () => reject(session.signal.reason), { once: true });

        evaluate();
    });
}
