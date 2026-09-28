/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type VideoTaskType = "WATCH_VIDEO" | "WATCH_VIDEO_ON_DESKTOP" | "WATCH_VIDEO_ON_MOBILE";
export type TaskType = VideoTaskType | "PLAY_ON_DESKTOP" | "STREAM_ON_DESKTOP" | "PLAY_ACTIVITY";

export const VIDEO_TASKS: readonly VideoTaskType[] = ["WATCH_VIDEO", "WATCH_VIDEO_ON_DESKTOP", "WATCH_VIDEO_ON_MOBILE"];

export const SUPPORTED_TASKS: readonly TaskType[] = [
    ...VIDEO_TASKS,
    "PLAY_ON_DESKTOP",
    "STREAM_ON_DESKTOP",
    "PLAY_ACTIVITY"
];

export interface QuestTask {
    type: string;
    target: number;
    applications?: Array<{ id: string; name?: string; }>;
}

export interface QuestTaskConfig {
    tasks: Record<string, QuestTask | undefined>;
    joinOperator?: "or" | "and";
}

export interface QuestConfig {
    id: string;
    configVersion: number;
    expiresAt: string;
    messages: { questName: string; gameTitle?: string; gamePublisher?: string; };
    taskConfig?: QuestTaskConfig;
    taskConfigV2?: QuestTaskConfig;

    application?: { id: string; name: string; };
}

export interface QuestProgress {
    value: number;
    completedAt?: string | null;
}

export interface QuestUserStatus {
    enrolledAt?: string | null;
    completedAt?: string | null;
    progress?: Partial<Record<string, QuestProgress>>;
    streamProgressSeconds?: number;
}

export interface Quest {
    id: string;
    config: QuestConfig;
    userStatus: QuestUserStatus | null;
}

export function isVideoTask(task: string): task is VideoTaskType {
    return (VIDEO_TASKS as readonly string[]).includes(task);
}

export function getTasks(quest: Quest): Record<string, QuestTask | undefined> {
    return (quest.config.taskConfig ?? quest.config.taskConfigV2)?.tasks ?? {};
}

export function pickTask(quest: Quest): TaskType | null {
    const tasks = getTasks(quest);
    return SUPPORTED_TASKS.find(task => tasks[task] != null) ?? null;
}

export function getTarget(quest: Quest, task: TaskType): number {
    return getTasks(quest)[task]?.target ?? 0;
}

export function getApplicationId(quest: Quest, task: TaskType): string | null {
    return getTasks(quest)[task]?.applications?.[0]?.id ?? quest.config.application?.id ?? null;
}

export function getQuestName(quest: Quest): string {
    return quest.config.messages?.questName ?? "Quest";
}

export function getGameName(quest: Quest): string {
    return quest.config.messages?.gameTitle ?? quest.config.application?.name ?? getQuestName(quest);
}

export function progressOf(status: QuestUserStatus | null | undefined, task: TaskType): number {
    const fallback = task === "STREAM_ON_DESKTOP" ? status?.streamProgressSeconds : undefined;
    return Math.floor(status?.progress?.[task]?.value ?? fallback ?? 0);
}

export function percentOf(value: number, target: number): number {
    if (!(target > 0)) return 0;
    return Math.max(0, Math.min(100, Math.floor(value / target * 100)));
}

export const isEnrolled = (quest: Quest) => quest.userStatus?.enrolledAt != null;
export const isCompleted = (quest: Quest) => quest.userStatus?.completedAt != null;

export function isExpired(quest: Quest, now = Date.now()): boolean {
    const expiresAt = Date.parse(quest.config.expiresAt);
    return !Number.isNaN(expiresAt) && expiresAt <= now;
}

export function canAutomate(quest: Quest, now = Date.now()): boolean {
    return isEnrolled(quest) && !isCompleted(quest) && !isExpired(quest, now) && pickTask(quest) != null;
}
