/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { accountReady } from "../core/account";
import { logger } from "../core/logger";
import { settings } from "../core/settings";
import { sleep } from "../core/sleep";
import { getQuest } from "../core/stores";
import {
    getQuestName,
    getTarget,
    isCompleted,
    isEnrolled,
    isExpired,
    isVideoTask,
    pickTask,
    type TaskType
} from "../core/types";
import { notify } from "../ui/notify";
import { confirmSwitch, createSessionUI } from "../ui/pills";
import { runActivity } from "./activity";
import type { QuestDeps } from "./contracts";
import { deps } from "./deps";
import { forgetQuest, loadSavedQuests, rememberQuest } from "./persistence";
import { runPlay } from "./play";
import { type Outcome, QuestSession } from "./session";
import { runStream } from "./stream";
import { runVideo } from "./video";

type Runner = (session: QuestSession, deps: QuestDeps) => Promise<boolean>;

const runners: Record<TaskType, Runner> = {
    WATCH_VIDEO: runVideo,
    WATCH_VIDEO_ON_DESKTOP: runVideo,
    WATCH_VIDEO_ON_MOBILE: runVideo,
    PLAY_ON_DESKTOP: runPlay,
    STREAM_ON_DESKTOP: runStream,
    PLAY_ACTIVITY: runActivity
};

const sessions = new Map<string, QuestSession>();

const starting = new Set<string>();

const autoStarted = new Set<string>();

const listeners = new Set<() => void>();
let version = 0;

function changed() {
    version++;
    listeners.forEach(listener => listener());
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const getVersion = () => version;
export const isRunning = (questId: string) => sessions.has(questId) || starting.has(questId);

export const isAutoStarted = (questId: string) => autoStarted.has(questId);

const sessionUI = createSessionUI(cancelQuest);

type EndListener = (session: QuestSession, outcome: Outcome) => void;
const endListeners = new Set<EndListener>();

export function onSessionEnded(listener: EndListener) {
    endListeners.add(listener);
    return () => endListeners.delete(listener);
}

export const getSessionPercent = (questId: string) => sessions.get(questId)?.percent;

function onSessionEnd(session: QuestSession, outcome: Outcome) {
    sessions.delete(session.id);
    autoStarted.delete(session.id);
    void forgetQuest(session.id);
    changed();

    for (const listener of endListeners) {
        try {
            listener(session, outcome);
        } catch (error) {
            logger.error("A quest end listener failed", error);
        }
    }
}

function describeError(error: unknown): string {
    const e = error as any;
    return e?.body?.message ?? e?.message ?? (e?.status ? `Request failed (${e.status})` : "An unexpected error occurred");
}

function run(session: QuestSession) {
    void (async () => {
        try {
            const reported = await runners[session.task](session, deps);
            if (!session.active) return;

            await sleep(1000, session.signal);
            if (reported || getQuest(session.id)?.userStatus?.completedAt != null) session.complete();
            else session.end("incomplete", "Progress saved. Click Auto Complete again to finish.");
        } catch (error) {
            if (!session.active) return;

            logger.error(`${session.task} quest failed`, error);
            session.fail(describeError(error));
        }
    })();
}

function runningNonVideo(): QuestSession[] {
    return [...sessions.values()].filter(session => !isVideoTask(session.task));
}

export function cancelQuest(questId: string, text?: string) {
    sessions.get(questId)?.cancel(text);
}

export function cancelAll() {
    [...sessions.values()].forEach(session => session.cancel());
}

export type StartResult = "started" | "cancelled" | "already-running" | "invalid" | "conflict" | "declined";

export interface StartOptions {
    toggle?: boolean;

    prompt?: boolean;

    auto?: boolean;
}

function refuse(title: string, body: string, questId?: string): StartResult {
    notify(title, body, "error", questId);
    return "invalid";
}

export async function startQuest(questId: string, { toggle = true, prompt = true, auto = false }: StartOptions = {}): Promise<StartResult> {
    if (sessions.has(questId)) {
        if (!toggle) return "already-running";

        cancelQuest(questId);
        return "cancelled";
    }
    if (starting.has(questId)) return "already-running";

    starting.add(questId);
    changed();

    try {
        const quest = getQuest(questId);
        if (!quest) return refuse("Error", "Quest not found");
        if (isCompleted(quest)) return refuse("Already Completed", "This quest is already completed");
        if (!isEnrolled(quest)) return refuse("Accept the quest first", "Click \"Accept Quest\" in Discord, then use Auto Complete.");
        if (isExpired(quest)) return refuse("Quest Expired", "This quest has expired");

        const task = pickTask(quest);
        if (!task) return refuse("Unsupported Quest", "This quest type can't be automated.");

        if (IS_WEB && (task === "PLAY_ON_DESKTOP" || task === "STREAM_ON_DESKTOP"))
            return refuse("Desktop Required", "This quest requires the Discord desktop app", questId);

        if (!isVideoTask(task)) {
            const other = runningNonVideo()[0];
            if (other) {
                if (!prompt) return "conflict";

                const replace = await confirmSwitch(other.name, getQuestName(quest));
                if (!replace) return "declined";
                if (sessions.has(questId)) return "already-running";
                runningNonVideo().forEach(session => session.cancel());
            }
        }

        const session = new QuestSession(quest, task, getTarget(quest, task), sessionUI, onSessionEnd);
        sessions.set(questId, session);
        if (auto) autoStarted.add(questId);
        session.start();
        void rememberQuest({ questId, taskType: task, startedAt: Date.now() });
        run(session);
        return "started";
    } finally {
        starting.delete(questId);
        changed();
    }
}

let resumed = false;

export function resetResume() {
    resumed = false;
}

export async function resumeSavedQuests() {
    if (resumed || !accountReady()) return;
    resumed = true;

    if (!settings.store.autoResumeAfterReload) return;

    try {
        for (const saved of await loadSavedQuests()) {
            const quest = getQuest(saved.questId);

            if (!quest || isCompleted(quest) || isExpired(quest) || !isEnrolled(quest)) {
                await forgetQuest(saved.questId);
                continue;
            }

            notify("Resuming Quest", `Auto-resuming: ${getQuestName(quest)}`, "info");
            void startQuest(saved.questId, { auto: true });
        }
    } catch (error) {
        logger.warn("Could not resume the saved quests", error);
    }
}
