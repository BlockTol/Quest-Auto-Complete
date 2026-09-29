/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI } from "@webpack/common";

import type { QuestApi } from "../quests/contracts";
import { withRateLimitRetry } from "./retry";
import { sleep } from "./sleep";

function request(method: "get" | "post", url: string, body: Record<string, unknown> | undefined, signal?: AbortSignal) {
    return withRateLimitRetry(async () => {
        signal?.throwIfAborted();
        const res = await RestAPI[method]({ url, body });
        return res?.body;
    }, { signal, sleep });
}

export const questApi: QuestApi = {
    get: (url, signal) => request("get", url, undefined, signal),
    post: (url, body, signal) => request("post", url, body, signal)
};
