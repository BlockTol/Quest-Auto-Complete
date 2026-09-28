/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { setOwner } from "./core/account";
import { cancelAll, resetResume } from "./quests/manager";
import { startQueue, stopQueue } from "./queue/runner";
import { unloadQueue } from "./queue/store";
import { dismissPrompts } from "./ui/pills";
import { reset as resetOverlay } from "./ui/store";

export function leaveAccount() {
    stopQueue();
    unloadQueue();
    cancelAll();
    dismissPrompts();
    resetOverlay();
    setOwner(null);
}

export function enterAccount(userId: string) {
    setOwner(userId);
    resetResume();
    void startQueue();
}
