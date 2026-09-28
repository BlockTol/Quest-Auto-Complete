/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { QuestDeps } from "./contracts";
import type { QuestSession } from "./session";

const MAX_CONSECUTIVE_ERRORS = 5;

export async function runActivity(session: QuestSession, deps: QuestDeps): Promise<boolean> {
    const { id, task, target, signal } = session;

    if (!(target > 0)) throw new Error("Invalid quest configuration");

    const channelId = deps.findActivityChannelId();
    if (!channelId) throw new Error("No channel available to run the activity in");

    const url = `/quests/${id}/heartbeat`;
    const streamKey = `call:${channelId}:1`;
    let errors = 0;

    session.say(`Completing: ${session.name}`);

    while (true) {
        signal.throwIfAborted();

        try {
            const res = await deps.api.post(url, { stream_key: streamKey, terminal: false }, signal);
            errors = 0;

            const progress: number = res?.progress?.[task]?.value ?? 0;
            session.setProgressFrom(progress);

            if (progress >= target) {
                await deps.api.post(url, { stream_key: streamKey, terminal: true }, signal);
                return true;
            }
        } catch (error) {
            if (!session.active || ++errors >= MAX_CONSECUTIVE_ERRORS) throw error;
            deps.warn("activity heartbeat failed, retrying", error);
        }

        await deps.sleep(deps.heartbeatIntervalMs(), signal);
    }
}
