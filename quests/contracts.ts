/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Quest } from "@plugins/QuestAutoComplete/core/types";

export interface QuestApi {
    get(url: string, signal?: AbortSignal): Promise<any>;
    post(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<any>;
}

export interface FakeGame {
    cmdLine: string;
    exeName: string;
    exePath: string;
    hidden: boolean;
    isLauncher: boolean;
    id: string;
    name: string;
    pid: number;
    pidPath: number[];
    processName: string;
    start: number;
}

export interface QuestDeps {
    api: QuestApi;
    getQuest(id: string): Quest | undefined;

    spoofGame(game: FakeGame): () => void;

    spoofStream(applicationId: string, pid: number): () => void;

    subscribe(event: string, handler: (event: any) => void): () => void;
    sleep(ms: number, signal?: AbortSignal): Promise<void>;
    now(): number;
    isInVoiceChannel(): boolean;
    findActivityChannelId(): string | null;

    heartbeatIntervalMs(): number;
    debug(...args: unknown[]): void;
    warn(...args: unknown[]): void;
}
