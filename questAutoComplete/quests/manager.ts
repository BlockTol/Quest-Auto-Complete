import { DataStore } from "@api/index";
import { UserStore } from "@webpack/common";
import { settings } from "../index";
import {
    activeQuests,
    cleanupFunctions,
    getProgressBarKey,
    isPluginStopping,
    parseProgressBarKey,
    progressBars,
    refreshQuestButtonsRef,
} from "../core/state";
import { QuestsStore } from "../core/stores";
import { discordApiPost, discordApiGet } from "../core/api";
import { ALL_TASK_TYPES, Quest, SavedQuestState, isVideoTask } from "../core/types";
import { clearQuestTimers } from "../core/utils";
import { showQuestConflictModal } from "../ui/modals";
import { notify, createQuestPill, completeQuestPill, removeQuestPill } from "../ui/notifications";
import { removeProgressBar } from "../ui/progressBar";
import { completeActivityQuest } from "./activity";
import { completePlayQuest } from "./play";
import { completeStreamQuest } from "./stream";
import { completeVideoQuest } from "./video";
const SAVED_STATE_KEY = "questautocomplete-active-quests";
export function cleanupQuest(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    clearQuestTimers(questId, userId);
    const cleanups = cleanupFunctions.get(key);
    if (cleanups) {
        cleanups.forEach(fn => {
            try { fn(); } catch (error) { }
        });
        cleanupFunctions.delete(key);
    }
    activeQuests.delete(key);
    removeProgressBar(questId, userId);
    removeSavedQuestState(questId).catch(() => { });
    setTimeout(() => {
        if (refreshQuestButtonsRef) {
            refreshQuestButtonsRef();
        }
    }, 100);
}
export function cancelQuest(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.isProcessing = false;
        completeQuestPill(questId, "Quest Cancelled", false);
        cleanupQuest(questId, userId);
    }
}
function getRunningQuestTaskType(questId: string): string | null {
    for (const [_, data] of activeQuests.entries()) {
        if (data.isProcessing && data.questId === questId) {
            return data.taskType;
        }
    }
    return null;
}
function getRunningNonVideoQuestId(): string | null {
    for (const [_, data] of activeQuests.entries()) {
        if (data.isProcessing && !isVideoTask(data.taskType)) {
            return data.questId;
        }
    }
    return null;
}
function getRunningQuestIds(): string[] {
    const ids: string[] = [];
    for (const [_, data] of activeQuests.entries()) {
        if (data.isProcessing) {
            ids.push(data.questId);
        }
    }
    return ids;
}
function canRunInParallel(newTaskType: string): { canRun: boolean; conflictQuestId: string | null } {
    if (isVideoTask(newTaskType)) {
        return { canRun: true, conflictQuestId: null };
    }
    const conflictId = getRunningNonVideoQuestId();
    if (conflictId) {
        return { canRun: false, conflictQuestId: conflictId };
    }
    return { canRun: true, conflictQuestId: null };
}
async function saveQuestState(questId: string, taskType: string) {
    try {
        const saved: SavedQuestState[] = (await DataStore.get(SAVED_STATE_KEY)) || [];
        const existing = saved.findIndex(s => s.questId === questId);
        const entry: SavedQuestState = { questId, taskType, startedAt: Date.now() };
        if (existing >= 0) {
            saved[existing] = entry;
        } else {
            saved.push(entry);
        }
        await DataStore.set(SAVED_STATE_KEY, saved);
    } catch (e) {
        console.warn("[QuestAutoComplete] Failed to save quest state:", e);
    }
}
async function removeSavedQuestState(questId: string) {
    try {
        const saved: SavedQuestState[] = (await DataStore.get(SAVED_STATE_KEY)) || [];
        const filtered = saved.filter(s => s.questId !== questId);
        await DataStore.set(SAVED_STATE_KEY, filtered);
    } catch (e) {
        console.warn("[QuestAutoComplete] Failed to remove saved quest state:", e);
    }
}
export async function checkAndResumeQuests() {
    if (!settings.store.autoResumeAfterReload) return;
    try {
        const saved: SavedQuestState[] = (await DataStore.get(SAVED_STATE_KEY)) || [];
        if (saved.length === 0) return;
        console.log(`[QuestAutoComplete] Found ${saved.length} saved quest(s), attempting resume...`);
        for (const entry of saved) {
            const quest = QuestsStore?.getQuest(entry.questId);
            if (!quest) {
                console.log(`[QuestAutoComplete] Quest ${entry.questId} no longer available, removing saved state`);
                await removeSavedQuestState(entry.questId);
                continue;
            }
            if (quest.userStatus?.completedAt) {
                console.log(`[QuestAutoComplete] Quest ${entry.questId} already completed, removing saved state`);
                await removeSavedQuestState(entry.questId);
                continue;
            }
            const expiresAt = quest.config?.expiresAt ?? quest.expiresAt;
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
                console.log(`[QuestAutoComplete] Quest ${entry.questId} expired, removing saved state`);
                await removeSavedQuestState(entry.questId);
                continue;
            }
            const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Unknown Quest";
            notify("Resuming Quest", `Auto-resuming: ${questName}`, "info");
            await new Promise(r => setTimeout(r, 1000));
            await startQuest(entry.questId);
        }
    } catch (e) {
        console.warn("[QuestAutoComplete] Failed to check saved quests:", e);
    }
}
export async function startQuest(questId: string) {
    if (!QuestsStore) {
        notify("Error", "Stores not initialized", "error");
        return;
    }
    const userId = UserStore.getCurrentUser()?.id;
    if (!userId) {
        notify("Error", "Could not get current user", "error");
        return;
    }
    const key = getProgressBarKey(questId, userId);
    if (activeQuests.has(key)) {
        const questData = activeQuests.get(key)!;
        if (questData.isProcessing) {
            cancelQuest(questId, userId);
            return;
        }
    }
    try {
        const origLog = console.log;
        const origWarn = console.warn;
        console.log = () => {};
        console.warn = () => {};
        let quest: any;
        try {
            quest = QuestsStore.getQuest(questId);
        } finally {
            console.log = origLog;
            console.warn = origWarn;
        }
        if (!quest) {
            notify("Error", "Quest not found", "error");
            return;
        }
        if (quest.userStatus?.completedAt) {
            notify("Already Completed", "This quest is already completed", "info");
            return;
        }
        if (!quest.userStatus?.enrolledAt) {
            try {
                notify("Enrolling...", "Accepting quest automatically...", "info");
                await discordApiPost(`/quests/${questId}/enroll`, { location: 2 });
                await new Promise(r => setTimeout(r, 1500));
                console.log = () => {};
                console.warn = () => {};
                try {
                    quest = QuestsStore.getQuest(questId);
                } finally {
                    console.log = origLog;
                    console.warn = origWarn;
                }
                if (!quest) {
                    notify("Enrollment Failed", "Please click 'Accept Quest' manually in Discord first!", "error");
                    return;
                }
            } catch (enrollError: any) {
                console.error("[QuestAutoComplete] Auto-enroll failed:", enrollError);
            }
        }
        if (!quest.userStatus?.enrolledAt) {
            notify("Enrollment Required", "Please click 'Accept Quest' manually in Discord first!", "error");
            return;
        }
        const expiresAt = quest.config?.expiresAt ?? quest.expiresAt;
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
            notify("Quest Expired", "This quest has expired", "error");
            return;
        }
        const taskConfig =
            quest.config?.taskConfig ??
            quest.config?.taskConfigV2 ??
            quest.taskConfig ??
            quest.taskConfigV2 ??
            null;
        let taskName = taskConfig ? ALL_TASK_TYPES.find(x => taskConfig?.tasks?.[x] != null) : null;
        if (!taskName) {
            try {
                const questDataResp = await discordApiGet(`/quests/${questId}`);
                const apiQuest = questDataResp?.body ?? questDataResp;
                if (apiQuest) {
                    const apiTaskConfig =
                        apiQuest.config?.taskConfig ??
                        apiQuest.config?.taskConfigV2 ??
                        apiQuest.taskConfig ??
                        apiQuest.taskConfigV2 ??
                        null;
                    if (apiTaskConfig) {
                        taskName = ALL_TASK_TYPES.find(x => apiTaskConfig?.tasks?.[x] != null);
                        if (taskName) {
                            quest = apiQuest;
                        } else if (apiTaskConfig?.tasks) {
                            console.log("[QuestAutoComplete] Unknown task type! Tasks object keys:", Object.keys(apiTaskConfig.tasks));
                        }
                    }
                }
            } catch (apiErr) {
                console.warn("[QuestAutoComplete] API quest fetch failed:", apiErr);
            }
        }
        if (!taskName) {
            console.log("[QuestAutoComplete] Quest object keys:", Object.keys(quest));
            console.log("[QuestAutoComplete] quest.config keys:", quest.config ? Object.keys(quest.config) : "none");
            const taskCfg = quest.config?.taskConfigV2 ?? quest.config?.taskConfig ?? quest.taskConfigV2 ?? quest.taskConfig;
            if (taskCfg && taskCfg.tasks) {
                console.log("[QuestAutoComplete] EXACT TASKS FOUND:", Object.keys(taskCfg.tasks));
            } else {
                console.log("[QuestAutoComplete] No tasks object found in config!", taskCfg);
            }
            notify("Unknown Quest Type", "Could not determine quest type. Try accepting the quest manually first.", "error");
            return;
        }
        const finalTaskConfig =
            quest.config?.taskConfig ??
            quest.config?.taskConfigV2 ??
            quest.taskConfig ??
            quest.taskConfigV2;
        const { canRun, conflictQuestId } = canRunInParallel(taskName);
        if (!canRun && conflictQuestId) {
            const shouldSwitch = await showQuestConflictModal(conflictQuestId, questId);
            if (shouldSwitch) {
                const runningUserId = UserStore.getCurrentUser()?.id;
                if (runningUserId) {
                    cancelQuest(conflictQuestId, runningUserId);
                }
            } else {
                return;
            }
        }
        const targetProgress = finalTaskConfig?.tasks?.[taskName]?.target || 0;
        const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Quest";
        activeQuests.set(key, {
            questId,
            userId,
            taskType: taskName,
            isProcessing: true,
            timeoutIds: [],
            intervalIds: [],
            lastProgress: 0,
            targetProgress,
        });
        await saveQuestState(questId, taskName);
        createQuestPill(questId, questName);
        const isDesktopApp = typeof (window as any).DiscordNative !== "undefined";
        switch (taskName) {
            case "WATCH_VIDEO":
            case "WATCH_VIDEO_ON_MOBILE":
            case "WATCH_VIDEO_ON_DESKTOP":
                await completeVideoQuest(quest, userId);
                break;
            case "PLAY_ON_DESKTOP":
                if (isDesktopApp) {
                    await completePlayQuest(quest, userId);
                } else {
                    notify("Desktop Required", "This quest requires Discord desktop app", "error", questId);
                    cleanupQuest(questId, userId);
                }
                break;
            case "STREAM_ON_DESKTOP":
                if (isDesktopApp) {
                    await completeStreamQuest(quest, userId);
                } else {
                    notify("Desktop Required", "This quest requires Discord desktop app", "error", questId);
                    cleanupQuest(questId, userId);
                }
                break;
            case "ACHIEVEMENT_IN_ACTIVITY":
            case "PLAY_ACTIVITY":
                await completeActivityQuest(quest, userId);
                break;
        }
    } catch (error) {
        console.error("[QuestAutoComplete] startQuest error:", error);
        notify("Quest Error", "An unexpected error occurred", "error", questId);
        cleanupQuest(questId, userId);
    }
}
