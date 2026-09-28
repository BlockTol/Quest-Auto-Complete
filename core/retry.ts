/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface RetryOptions {
    sleep(ms: number, signal?: AbortSignal): Promise<void>;
    signal?: AbortSignal;

    attempts?: number;
    random?: () => number;
}

function statusOf(error: any): number | undefined {
    return error?.status ?? error?.response?.status;
}

function retryAfterSeconds(error: any): number | undefined {
    const value = error?.body?.retry_after ?? error?.response?.body?.retry_after ?? error?.retry_after;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function withRateLimitRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
    const { attempts = 4, signal, sleep, random = Math.random } = options;

    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (statusOf(error) !== 429 || attempt >= attempts) throw error;

            const asked = retryAfterSeconds(error);
            const waitMs = asked != null
                ? asked * 1000 + random() * 500
                : Math.min(2000 * attempt, 15000);

            await sleep(Math.min(waitMs, 60_000), signal);
        }
    }
}
