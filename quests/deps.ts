/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStore } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildChannelStore, SelectedChannelStore } from "@webpack/common";

import { questApi } from "../core/api";
import { debug, logger } from "../core/logger";
import { settings } from "../core/settings";
import { sleep } from "../core/sleep";
import { getQuest } from "../core/stores";
import type { FakeGame, QuestDeps } from "./contracts";

function patchMethod(target: any, key: string, replacement: (...args: any[]) => any): () => void {
    const hadOwn = Object.hasOwn(target, key);
    const original = target[key];
    let restored = false;

    target[key] = replacement;

    return () => {
        if (restored) return;
        restored = true;

        if (hadOwn) target[key] = original;
        else delete target[key];
    };
}

function spoofGame(game: FakeGame) {
    const store: any = findStore("RunningGameStore");
    const realGames: FakeGame[] = store.getRunningGames();
    const games = [game];

    const undo = [
        patchMethod(store, "getRunningGames", () => games),
        patchMethod(store, "getGameForPID", (pid: number) => games.find(g => g.pid === pid))
    ];

    FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: games, games });

    let undone = false;
    return () => {
        if (undone) return;
        undone = true;

        undo.forEach(fn => fn());

        const current: FakeGame[] = store.getRunningGames();
        FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: games, added: current, games: current });
    };
}

function spoofStream(applicationId: string, pid: number) {
    const store: any = findStore("ApplicationStreamingStore");
    return patchMethod(store, "getStreamerActiveStreamMetadata", () => ({ id: applicationId, pid, sourceName: null }));
}

function heartbeatIntervalMs() {
    switch (settings.store.activityHeartbeat) {
        case "official": return 60_000 + Math.random() * 1000;
        case "balanced": return 20_000 + Math.random() * 2000;
        default: return 800 + Math.random() * 700;
    }
}

function findActivityChannelId(): string | null {
    const dm = (ChannelStore as any).getSortedPrivateChannels?.()?.[0]?.id;
    if (dm) return dm;

    const guilds = Object.values((GuildChannelStore as any).getAllGuilds?.() ?? {}) as any[];
    return guilds.find(guild => guild?.VOCAL?.length > 0)?.VOCAL?.[0]?.channel?.id ?? null;
}

export const deps: QuestDeps = {
    api: questApi,
    getQuest,
    spoofGame,
    spoofStream,
    subscribe(event, handler) {
        FluxDispatcher.subscribe(event as any, handler);
        return () => FluxDispatcher.unsubscribe(event as any, handler);
    },
    sleep,
    now: Date.now,
    isInVoiceChannel: () => !!SelectedChannelStore.getVoiceChannelId(),
    findActivityChannelId,
    heartbeatIntervalMs,
    debug,
    warn: (...args) => logger.warn(...args)
};
