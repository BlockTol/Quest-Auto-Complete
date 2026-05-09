import { QuestData } from "./types";
const KEY_SEPARATOR = ":";
export let activeQuests = new Map<string, QuestData>();
export let progressBars = new Map<string, HTMLElement>();
export let cleanupFunctions = new Map<string, Array<() => void>>();
export let progressUpdateHandlers = new Map<string, any>();
export let isPluginStopping = false;
export let refreshQuestButtonsRef: (() => void) | null = null;
export function setPluginStopping(value: boolean) {
    isPluginStopping = value;
}
export function setRefreshQuestButtonsRef(fn: (() => void) | null) {
    refreshQuestButtonsRef = fn;
}
export function getProgressBarKey(questId: string, userId: string): string {
    return `${questId}${KEY_SEPARATOR}${userId}`;
}
export function parseProgressBarKey(key: string): { questId: string; userId: string } | null {
    const parts = key.split(KEY_SEPARATOR);
    if (parts.length !== 2) return null;
    return { questId: parts[0], userId: parts[1] };
}
