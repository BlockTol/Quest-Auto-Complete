/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "@plugins/QuestAutoComplete/core/settings";

import {
    addItem,
    durationMs,
    findItem,
    later,
    makeRoomForToast,
    nextId,
    pillId,
    type PillItem,
    removeItem,
    type Tone,
    updateItem
} from "./store";

let slideNonce = 0;

export function notify(title: string, body: string, tone: Tone = "info", questId?: string) {
    if (tone !== "error" && !settings.store.showNotifications) return;

    const pill = questId ? findItem<PillItem>(pillId(questId), "pill") : undefined;

    if (pill) {
        const nonce = ++slideNonce;
        updateItem(pill.id, { slide: { text: body, tone, nonce } });
        later(() => {
            if (findItem<PillItem>(pill.id, "pill")?.slide?.nonce === nonce) updateItem(pill.id, { slide: null });
        }, durationMs());
        return;
    }

    makeRoomForToast();

    const id = nextId("toast");
    addItem({ kind: "toast", id, closing: false, title, body, tone });
    later(() => removeItem(id), durationMs());
}
