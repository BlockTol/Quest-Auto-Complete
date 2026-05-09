import { discordApiPost, rateLimitedPost } from "../core/api";
import { settings } from "../index";
import { activeQuests, getProgressBarKey, isPluginStopping } from "../core/state";
import { QuestsStore } from "../core/stores";
import { Quest } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { createProgressBar, getDiscordProgressPercent, removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
export async function completeVideoQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = (quest.config?.taskConfig ?? quest.config?.taskConfigV2) ?? (quest.taskConfig ?? quest.taskConfigV2);
    const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP"].find(x => taskConfig?.tasks?.[x] != null);
    if (!taskName) {
        notify("Error", "Invalid video quest configuration", "error", quest.id);
        return false;
    }
    const secondsNeeded = taskConfig.tasks[taskName].target;
    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest duration", "error", quest.id);
        return false;
    }
    const freshQuest = QuestsStore?.getQuest(quest.id);
    if (freshQuest?.userStatus?.completedAt) {
        notify("Already Completed", "This quest was already completed!", "info", quest.id);
        return true;
    }
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    const maxFuture = 10;
    const speed = 7;
    const interval = 1;
    const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
    let completed = false;
    const key = getProgressBarKey(quest.id, userId);
    const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Video Quest";
    updateQuestPill(quest.id, `Spoofing video for ${questName}`, 0);
    if (settings.store.showProgressBar) {
        createProgressBar(quest.id, userId);
        setTimeout(() => {
            const initialPercent = getDiscordProgressPercent(quest.id);
            if (initialPercent !== null) {
                updateProgressBar(quest.id, userId, initialPercent);
            }
        }, 100);
    }
    try {
        const webpackChunk = (window as any).webpackChunkdiscord_app;
        let apiModule: any = null;
        if (webpackChunk) {
            const wpRequire = webpackChunk.push([[Symbol()], {}, (req: any) => req]);
            webpackChunk.pop();
            if (wpRequire?.c) {
                const modules = Object.values(wpRequire.c) as any[];
                apiModule = modules.find((x: any) => x?.exports?.Bo?.get)?.exports?.Bo
                    || modules.find((x: any) => x?.exports?.tn?.get)?.exports?.tn
                    || modules.find((x: any) => x?.exports?.HTTP?.get)?.exports?.HTTP;
            }
        }
        const postProgress = async (timestamp: number) => {
            if (apiModule) {
                const res = await apiModule.post({
                    url: `/quests/${quest.id}/video-progress`,
                    body: { timestamp },
                });
                return res.body?.completed_at != null;
            } else {
                const res = await rateLimitedPost(`/quests/${quest.id}/video-progress`, { timestamp });
                return res?.completed_at != null;
            }
        };
        while (true) {
            const questData = activeQuests.get(key);
            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
            const diff = maxAllowed - secondsDone;
            const timestamp = secondsDone + speed;
            if (diff >= speed) {
                try {
                    completed = await postProgress(Math.min(secondsNeeded, timestamp + Math.random()));
                    secondsDone = Math.min(secondsNeeded, timestamp);
                    const percent = Math.min(100, (secondsDone / secondsNeeded) * 100);
                    updateProgressBar(quest.id, userId, percent);
                    console.log(`[QuestAutoComplete] Video progress: ${secondsDone}/${secondsNeeded}`);
                } catch (e) {
                    console.warn("[QuestAutoComplete] Video progress error:", e);
                }
            }
            if (timestamp >= secondsNeeded) break;
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
        }
        if (!completed) {
            try {
                await postProgress(secondsNeeded);
            } catch (e) {
                console.warn("[QuestAutoComplete] Final video progress error:", e);
            }
        }
        updateProgressBar(quest.id, userId, 100);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const verifiedQuest = QuestsStore?.getQuest(quest.id);
        if (completed || verifiedQuest?.userStatus?.completedAt) {
            completeQuestPill(quest.id, `${questName} Completed!`, true);
            cleanupQuest(quest.id, userId);
            return true;
        } else {
            notify("Progress Saved", "Try clicking Auto Complete again to finish.", "info", quest.id);
            cleanupQuest(quest.id, userId);
            return false;
        }
    } catch (error: any) {
        console.error("[QuestAutoComplete] Video quest error:", error);
        notify("Quest Error", "An error occurred. Your progress was likely saved - try again.", "error", quest.id);
        cleanupQuest(quest.id, userId);
        return false;
    }
}
