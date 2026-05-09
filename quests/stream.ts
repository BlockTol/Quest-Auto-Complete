import { settings } from "../index";
import { activeQuests, cleanupFunctions, getProgressBarKey, isPluginStopping } from "../core/state";
import { findFluxDispatcher } from "../core/stores";
import { Quest } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { createProgressBar, getDiscordProgressPercent, removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
export async function completeStreamQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = (quest.config?.taskConfig ?? quest.config?.taskConfigV2) ?? (quest.taskConfig ?? quest.taskConfigV2);
    const secondsNeeded = taskConfig?.tasks?.STREAM_ON_DESKTOP?.target;
    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error", quest.id);
        return false;
    }
    const applicationId = quest.config?.application?.id ?? quest.application?.id;
    const applicationName = quest.config?.application?.name ?? quest.application?.name ?? "Unknown App";
    const currentProgress = quest.userStatus?.progress?.STREAM_ON_DESKTOP?.value ??
        quest.userStatus?.streamProgressSeconds ?? 0;
    updateQuestPill(quest.id, `Spoofed stream to ${applicationName}. Stream in VC for ${Math.ceil((secondsNeeded - currentProgress) / 60)} more minutes.`, 0);
    if (settings.store.showProgressBar) {
        createProgressBar(quest.id, userId);
        setTimeout(() => {
            const initialPercent = getDiscordProgressPercent(quest.id);
            if (initialPercent !== null) {
                updateProgressBar(quest.id, userId, initialPercent);
            }
        }, 100);
    }
    const pid = Math.floor(Math.random() * 30000) + 1000;
    const key = getProgressBarKey(quest.id, userId);
    return new Promise<boolean>(resolve => {
        try {
            const webpackChunk = (window as any).webpackChunkdiscord_app;
            if (!webpackChunk) {
                notify("Error", "Webpack not available", "error", quest.id);
                resolve(false);
                return;
            }
            const wpRequire = webpackChunk.push([[Symbol()], {}, (req: any) => req]);
            webpackChunk.pop();
            const modules = Object.values(wpRequire.c) as any[];
            const AppStreamingStoreLocal = modules.find((x: any) => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.A
                || modules.find((x: any) => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z;
            const FluxDispatcherLocal = findFluxDispatcher();
            if (!AppStreamingStoreLocal) {
                notify("Error", "ApplicationStreamingStore not found", "error", quest.id);
                resolve(false);
                return;
            }
            if (!FluxDispatcherLocal) {
                notify("Error", "FluxDispatcher not found", "error", quest.id);
                resolve(false);
                return;
            }
            const realFunc = AppStreamingStoreLocal.getStreamerActiveStreamMetadata;
            AppStreamingStoreLocal.getStreamerActiveStreamMetadata = () => ({
                id: applicationId,
                pid,
                sourceName: null,
            });
            console.log(`[QuestAutoComplete] Spoofed stream to ${applicationName}. Stream any window in VC for ${Math.ceil((secondsNeeded - currentProgress) / 60)} more minutes.`);
            console.log("[QuestAutoComplete] Remember that you need at least 1 other person to be in the VC!");
            const heartbeatHandler = (data: any) => {
                try {
                    const questData = activeQuests.get(key);
                    if (!questData || !questData.isProcessing || isPluginStopping) {
                        AppStreamingStoreLocal.getStreamerActiveStreamMetadata = realFunc;
                        FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                        removeProgressBar(quest.id, userId);
                        resolve(false);
                        return;
                    }
                    const configVersion = quest.config?.configVersion ?? quest.configVersion;
                    const progress = configVersion === 1
                        ? data.userStatus.streamProgressSeconds
                        : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                    const percent = Math.min(100, (progress / secondsNeeded) * 100);
                    updateProgressBar(quest.id, userId, percent);
                    console.log(`[QuestAutoComplete] Quest progress: ${progress}/${secondsNeeded}`);
                    if (progress >= secondsNeeded) {
                        console.log("[QuestAutoComplete] Quest completed!");
                        AppStreamingStoreLocal.getStreamerActiveStreamMetadata = realFunc;
                        FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                        const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Stream Quest";
                        completeQuestPill(quest.id, `${questName} Completed!`, true);
                        cleanupQuest(quest.id, userId);
                        resolve(true);
                    }
                } catch (e) {
                    console.error("[QuestAutoComplete] Heartbeat handler error:", e);
                }
            };
            FluxDispatcherLocal.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
            const cleanups = cleanupFunctions.get(key) || [];
            cleanups.push(() => {
                try {
                    AppStreamingStoreLocal.getStreamerActiveStreamMetadata = realFunc;
                    FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                } catch (e) { }
            });
            cleanupFunctions.set(key, cleanups);
        } catch (error: any) {
            console.error("[QuestAutoComplete] Failed to complete stream quest:", error);
            notify("Quest Error", `Failed: ${error?.message || "Unknown error"}`, "error", quest.id);
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            resolve(false);
        }
    });
}
