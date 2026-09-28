/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { progressOf } from "@plugins/QuestAutoComplete/core/types";

import type { QuestDeps } from "./contracts";
import type { QuestSession } from "./session";

const MAX_FUTURE_SECONDS = 10;

const SPEED_SECONDS = 7;
const TICK_MS = 1000;
const MAX_CONSECUTIVE_ERRORS = 5;

export async function runVideo(session: QuestSession, deps: QuestDeps): Promise<boolean> {
    const { id, task, target, quest, signal } = session;

    if (!(target > 0)) throw new Error("Invalid quest duration");

    const enrolledAt = Date.parse(quest.userStatus?.enrolledAt ?? "");
    if (Number.isNaN(enrolledAt)) throw new Error("Accept the quest first");

    const url = `/quests/${id}/video-progress`;
    let done = progressOf(deps.getQuest(id)?.userStatus ?? quest.userStatus, task);
    let completed = false;
    let errors = 0;

    session.say(`Spoofing video for ${session.name}`);
    session.setProgressFrom(done);

    while (true) {
        signal.throwIfAborted();

        const next = done + SPEED_SECONDS;
        const maxAllowed = Math.floor((deps.now() - enrolledAt) / 1000) + MAX_FUTURE_SECONDS;

        if (maxAllowed - done >= SPEED_SECONDS) {
            try {
                const res = await deps.api.post(url, { timestamp: Math.min(target, next + Math.random()) }, signal);
                completed = res?.completed_at != null;
                done = Math.min(target, next);
                errors = 0;
                session.setProgressFrom(done);
            } catch (error) {
                if (!session.active || ++errors >= MAX_CONSECUTIVE_ERRORS) throw error;
                deps.warn("video-progress failed, retrying", error);
            }
        }

        if (completed || next >= target) break;

        await deps.sleep(TICK_MS, signal);
    }

    if (!completed) {
        const res = await deps.api.post(url, { timestamp: target }, signal);
        completed = res?.completed_at != null;
    }

    session.setProgress(100);
    return completed;
}
