/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { keyFor, loadOwned } from "../core/account";
import { SAVED_QUESTS_KEY } from "../core/constants";
import { logger } from "../core/logger";

export interface SavedQuest {
    questId: string;
    taskType: string;
    startedAt: number;
}

export async function loadSavedQuests(): Promise<SavedQuest[]> {
    return (await loadOwned<SavedQuest[]>(SAVED_QUESTS_KEY)) ?? [];
}

export function rememberQuest(entry: SavedQuest) {
    const key = keyFor(SAVED_QUESTS_KEY);
    if (!key) return Promise.resolve();

    return DataStore.update<SavedQuest[]>(key, list => [
        ...(list ?? []).filter(saved => saved.questId !== entry.questId),
        entry
    ]).catch(error => logger.warn("Could not save the quest state", error));
}

export function forgetQuest(questId: string) {
    const key = keyFor(SAVED_QUESTS_KEY);
    if (!key) return Promise.resolve();

    return DataStore.update<SavedQuest[]>(key, list => (list ?? []).filter(saved => saved.questId !== questId))
        .catch(error => logger.warn("Could not clear the saved quest state", error));
}
