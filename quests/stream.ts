/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getApplicationId, getGameName, progressOf } from "@plugins/QuestAutoComplete/core/types";

import type { QuestDeps } from "./contracts";
import { waitForServerProgress } from "./progress";
import type { QuestSession } from "./session";

const GRACE_MS = 15 * 60_000;
const STALL_MS = 5 * 60_000;

export async function runStream(session: QuestSession, deps: QuestDeps): Promise<boolean> {
    const { quest, task, target } = session;

    if (!(target > 0)) throw new Error("Invalid quest configuration");

    const applicationId = getApplicationId(quest, task);
    if (!applicationId) throw new Error("Could not find the game for this quest");

    const pid = Math.floor(Math.random() * 30000) + 1000;
    session.onCleanup(deps.spoofStream(applicationId, pid));

    const remaining = Math.max(0, target - progressOf(deps.getQuest(session.id)?.userStatus ?? quest.userStatus, task));
    const minutes = Math.ceil(remaining / 60);
    const game = getGameName(quest);

    session.say(deps.isInVoiceChannel()
        ? `Spoofed stream to ${game}. Keep streaming for ${minutes} more minutes; at least 1 other person must be in the call.`
        : `Spoofed stream to ${game}. Join a voice channel with at least 1 other person and start streaming any window for ${minutes} minutes.`);

    await waitForServerProgress(session, deps, { graceMs: GRACE_MS, stallMs: STALL_MS });
    return true;
}
