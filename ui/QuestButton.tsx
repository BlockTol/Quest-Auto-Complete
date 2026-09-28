/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { canAutomate, type Quest } from "@plugins/QuestAutoComplete/core/types";
import { getVersion, isRunning, startQuest, subscribe } from "@plugins/QuestAutoComplete/quests/manager";
import { React } from "@webpack/common";

import { DiscordButton } from "./DiscordButton";

export function QuestButton({ quest }: { quest: Quest; }) {
    React.useSyncExternalStore(subscribe, getVersion);

    if (!canAutomate(quest)) return null;

    const running = isRunning(quest.id);

    return (
        <DiscordButton
            variant={running ? "critical-primary" : "primary"}
            text={running ? "Cancel" : "Auto Complete"}
            fullWidth
            onClick={() => void startQuest(quest.id)}
        />
    );
}
