/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { openInviteModal } from "@utils/discord";
import { ChannelStore, NavigationRouter } from "@webpack/common";

import { DISMISSED_VERSION_KEY, PLUGIN_VERSION, SUPPORT_CHANNEL_ID, SUPPORT_INVITE } from "../core/constants";
import { debug } from "../core/logger";
import { fetchLatestRelease, isMandatory, isNewer, type ReleaseInfo, summarizeNotes } from "../core/updater";
import { addItem, findItem, type PromptItem, removeItem } from "./store";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_PROMPT_ID = "update";

export type UpdateResult =
    | { state: "available"; version: string; }
    | { state: "latest"; }
    | { state: "none"; }
    | { state: "failed"; };

function openSupport() {
    const channel = ChannelStore.getChannel(SUPPORT_CHANNEL_ID);
    if (channel?.guild_id) NavigationRouter.transitionTo(`/channels/${channel.guild_id}/${SUPPORT_CHANNEL_ID}`);
    else openInviteModal(SUPPORT_INVITE);
}

function showUpdatePrompt(release: ReleaseInfo) {
    if (findItem<PromptItem>(UPDATE_PROMPT_ID, "prompt")) return;

    const mandatory = isMandatory(release.notes);

    addItem({
        kind: "prompt",
        id: UPDATE_PROMPT_ID,
        closing: false,
        title: `QuestAutoComplete update: v${release.version}`,

        body: `Current: v${PLUGIN_VERSION}\n${summarizeNotes(release.notes)}${mandatory ? "\nThis is a mandatory update." : ""}`,
        actions: [
            ...mandatory ? [] : [{
                label: "Not Now",
                variant: "danger" as const,
                onClick: () => {
                    DataStore.set(DISMISSED_VERSION_KEY, release.version);
                    removeItem(UPDATE_PROMPT_ID);
                }
            }],
            {
                label: "View Update",
                variant: "primary" as const,
                onClick: () => {
                    openSupport();
                    removeItem(UPDATE_PROMPT_ID);
                }
            }
        ]
    }, { front: true });
}

export async function runUpdateCheck(manual: boolean): Promise<UpdateResult> {
    try {
        const release = await fetchLatestRelease();
        if (!release) return { state: "none" };
        if (!isNewer(release.version)) return { state: "latest" };

        if (manual || await DataStore.get(DISMISSED_VERSION_KEY) !== release.version) showUpdatePrompt(release);

        return { state: "available", version: release.version };
    } catch (error) {
        debug("Update check failed", error);
        return { state: "failed" };
    }
}

let interval: ReturnType<typeof setInterval> | null = null;
let first: ReturnType<typeof setTimeout> | null = null;

export function startUpdateChecks() {
    stopUpdateChecks();
    first = setTimeout(() => void runUpdateCheck(false), 5000);
    interval = setInterval(() => void runUpdateCheck(false), CHECK_INTERVAL_MS);
}

export function stopUpdateChecks() {
    if (first) clearTimeout(first);
    if (interval) clearInterval(interval);
    first = interval = null;
}
