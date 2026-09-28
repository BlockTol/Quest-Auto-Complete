/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { UserStore } from "@webpack/common";

import { questsLoaded } from "./stores";

let owner: string | null = null;

let quests: "loading" | "loaded" | "check" = "loading";

export function currentUserId(): string | null {
    try {
        return UserStore.getCurrentUser()?.id ?? null;
    } catch {
        return null;
    }
}

export const getOwner = () => owner;

export function setOwner(id: string | null, { storeMayBeLoaded = false } = {}) {
    owner = id;
    quests = storeMayBeLoaded ? "check" : "loading";
}

export function markQuestsLoaded() {
    if (owner != null) quests = "loaded";
}

export function accountReady(): boolean {
    if (owner == null) return false;
    if (quests === "check" && questsLoaded()) quests = "loaded";

    return quests === "loaded";
}

export const keyFor = (base: string): string | null => owner == null ? null : `${base}:${owner}`;

export async function loadOwned<T>(base: string): Promise<T | undefined> {
    const key = keyFor(base);
    if (!key) return undefined;

    const own = await DataStore.get<T>(key);
    if (own !== undefined) return own;

    const legacy = await DataStore.get<T>(base);
    if (legacy === undefined || keyFor(base) !== key) return undefined;

    await DataStore.set(key, legacy);
    await DataStore.del(base);
    return legacy;
}
