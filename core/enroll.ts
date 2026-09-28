/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByCodeLazy, findByPropsLazy } from "@webpack";

import { QuestStore } from "./stores";
import type { Quest } from "./types";

interface EnrollOptions {
    questContent: number;
    questContentCTA: string;
    sourceQuestContent: number;
}

type EnrollResponse = { type: "success" | "captcha_failed" | "unknown_error" | "previous_in_flight_request"; };

const enrollInQuest: (questId: string, options: EnrollOptions) => Promise<EnrollResponse> = findByCodeLazy('"QUESTS_ENROLL_BEGIN"');

const QuestContent = findByPropsLazy("QUEST_HOME_DESKTOP", "RUNNING_ACTIVITY");
const QuestContentCTA = findByPropsLazy("ACCEPT_QUEST", "START_QUEST");

const CAPTCHA_PAUSE_MS = 5 * 60_000;

export type AcceptResult =
    | { ok: true; }

    | { ok: false; reason: string; retryAt?: number; };

function blockedUntil(): number | null {
    const value: unknown = QuestStore.questEnrollmentBlockedUntil;
    if (value == null) return null;

    const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
    return Number.isNaN(time) ? null : time;
}

export async function acceptQuest(quest: Quest): Promise<AcceptResult> {
    if (QuestStore.isQuestAccessSuspended) return { ok: false, reason: "Quests are suspended on your account" };

    const until = blockedUntil();
    if (until != null && until > Date.now())
        return { ok: false, reason: "Discord is limiting quest sign-ups for now", retryAt: until };

    try {
        const { type } = await enrollInQuest(quest.id, {
            questContent: QuestContent.QUEST_HOME_DESKTOP,
            questContentCTA: QuestContentCTA.ACCEPT_QUEST,
            sourceQuestContent: QuestContent.QUEST_HOME_DESKTOP
        });

        switch (type) {
            case "success":
            case "previous_in_flight_request":
                return { ok: true };
            case "captcha_failed":
                return { ok: false, reason: "Discord asked for a captcha", retryAt: Date.now() + CAPTCHA_PAUSE_MS };
            default:
                return { ok: false, reason: "Discord didn't accept it" };
        }
    } catch (error) {
        return { ok: false, reason: (error as Error)?.message ?? "Something went wrong" };
    }
}
