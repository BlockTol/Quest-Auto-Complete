import { rateLimitedPost } from "../core/api";
import { settings } from "../index";
import { activeQuests, getProgressBarKey, isPluginStopping } from "../core/state";
import { ChannelStore, GuildChannelStore } from "../core/stores";
import { Quest } from "../core/types";
import { safeTimeout } from "../core/utils";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { createProgressBar, getDiscordProgressPercent, removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
export async function completeActivityQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = (quest.config?.taskConfig ?? quest.config?.taskConfigV2) ?? (quest.taskConfig ?? quest.taskConfigV2);
    const taskName = taskConfig?.tasks?.PLAY_ACTIVITY ? "PLAY_ACTIVITY" : "ACHIEVEMENT_IN_ACTIVITY";
    const targetNeeded = taskConfig?.tasks?.[taskName]?.target;
    if (taskName === "ACHIEVEMENT_IN_ACTIVITY") {
        notify("Unsupported Quest", "This quest requires completing in-game achievements. It cannot be automated.", "error", quest.id);
        return false;
    }
    if (!targetNeeded || targetNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error", quest.id);
        return false;
    }
    const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Activity Quest";
    updateQuestPill(quest.id, `Completing: ${questName}`, 0);
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
        const privateChannels = ChannelStore.getSortedPrivateChannels();
        const guilds = Object.values(GuildChannelStore.getAllGuilds() ?? {}) as any[];
        const channelId = privateChannels?.[0]?.id ??
            guilds.find((x: any) => x != null && x.VOCAL?.length > 0)?.VOCAL?.[0]?.channel?.id;
        if (!channelId) {
            notify("Quest Error", "No voice channel found", "error", quest.id);
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            return false;
        }
        const streamKey = `call:${channelId}:1`;
        const key = getProgressBarKey(quest.id, userId);
        let baseInterval = 0.8;
        const minInterval = 0.8;
        const maxInterval = 1.5;
        while (true) {
            const questData = activeQuests.get(key);
            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            try {
                const res = await rateLimitedPost(`/quests/${quest.id}/heartbeat`, {
                    stream_key: streamKey,
                    terminal: false,
                });
                const progress = res?.progress?.[taskName]?.value ?? 0;
                if (progress >= targetNeeded) {
                    await rateLimitedPost(`/quests/${quest.id}/heartbeat`, {
                        stream_key: streamKey,
                        terminal: true,
                    });
                    break;
                }
            } catch (error: any) {
                notify("Quest Error", "Failed to complete activity", "error", quest.id);
                removeProgressBar(quest.id, userId);
                cleanupQuest(quest.id, userId);
                return false;
            }
            const dynamicInterval = baseInterval + (Math.random() * (maxInterval - minInterval));
            await new Promise(resolve => safeTimeout(resolve as () => void, dynamicInterval * 1000, quest.id, userId));
        }
        updateProgressBar(quest.id, userId, 100);
        await new Promise(resolve => setTimeout(resolve, 2000));
        completeQuestPill(quest.id, `${questName} Completed!`, true);
        cleanupQuest(quest.id, userId);
        return true;
    } catch (error) {
        notify("Quest Error", "Failed to complete activity", "error", quest.id);
        removeProgressBar(quest.id, userId);
        cleanupQuest(quest.id, userId);
        return false;
    }
}
