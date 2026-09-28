/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy } from "@webpack";

import type { Quest } from "./types";

interface QuestStoreLike {
    quests: Map<string, Quest>;
    getQuest(questId: string): Quest | undefined;

    readonly questEnrollmentBlockedUntil: unknown;
    readonly isQuestAccessSuspended: boolean;
}

export const QuestStore: QuestStoreLike = findStoreLazy("QuestStore");

export function getQuest(questId: string): Quest | undefined {
    try {
        return QuestStore.getQuest(questId);
    } catch {
        return undefined;
    }
}

export function questsLoaded(): boolean {
    try {
        return QuestStore.quests.size > 0;
    } catch {
        return false;
    }
}
