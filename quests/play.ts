import { discordApiGet } from "../core/api";
import { settings } from "../index";
import { activeQuests, cleanupFunctions, debugLog, getProgressBarKey, isPluginStopping } from "../core/state";
import { findFluxDispatcher, QuestsStore } from "../core/stores";
import { Quest } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { createProgressBar, getDiscordProgressPercent, removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
export async function completePlayQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = (quest.config?.taskConfig ?? quest.config?.taskConfigV2) ?? (quest.taskConfig ?? quest.taskConfigV2);
    const secondsNeeded = taskConfig?.tasks?.PLAY_ON_DESKTOP?.target;
    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error", quest.id);
        return false;
    }
    const applicationId =
        quest.config?.application?.id ??
        quest.config?.applicationId ??
        quest.config?.application_id ??
        quest.application?.id ??
        quest.applicationId ??
        quest.application_id ??
        null;
    const applicationName =
        quest.config?.application?.name ??
        quest.config?.applicationName ??
        quest.application?.name ??
        quest.applicationName ??
        null;

    if (!applicationId || !applicationName) {
        console.warn("[QuestAutoComplete] Could not resolve applicationId/Name — dumping quest structure:");
        console.warn("[QuestAutoComplete] quest keys:", Object.keys(quest));
        console.warn("[QuestAutoComplete] quest.config:", JSON.stringify(quest.config ?? {}, null, 2));
    }

    const resolvedName = applicationName ?? "Unknown App";
    const currentProgress = quest.userStatus?.progress?.PLAY_ON_DESKTOP?.value ?? 0;
    updateQuestPill(quest.id, `Auto-completing: ${resolvedName}. Wait ~${Math.ceil((secondsNeeded - currentProgress) / 60)} minutes.`, 0);
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
    return new Promise<boolean>(async resolve => {
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
            const RunningGameStoreLocal = modules.find((x: any) => x?.exports?.Ay?.getRunningGames)?.exports?.Ay
                || modules.find((x: any) => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
            const FluxDispatcherLocal = findFluxDispatcher();
            if (!RunningGameStoreLocal) {
                notify("Error", "RunningGameStore not found", "error", quest.id);
                resolve(false);
                return;
            }
            if (!FluxDispatcherLocal) {
                notify("Error", "FluxDispatcher not found", "error", quest.id);
                resolve(false);
                return;
            }
            let appData: any = null;
            if (applicationId) {
                try {
                    const appDataResponse = await discordApiGet(`/applications/public?application_ids=${applicationId}`);
                    appData = appDataResponse?.[0] ?? null;
                } catch (e) {
                    console.warn(`[QuestAutoComplete] Could not fetch app data for ${applicationName}, using fallback:`, e);
                }
            }
            const exeName = appData?.executables?.find((x: any) => x.os === "win32")?.name?.replace(">", "")
                || `${resolvedName.toLowerCase().replace(/\s+/g, "")}.exe`;
            const fakeGame = {
                cmdLine: `C:\\Program Files\\${appData?.name || resolvedName}\\${exeName}`,
                exeName,
                exePath: `c:/program files/${(appData?.name || resolvedName).toLowerCase()}/${exeName}`,
                hidden: false,
                isLauncher: false,
                id: applicationId,
                name: appData?.name || resolvedName,
                pid: pid,
                pidPath: [pid],
                processName: appData?.name || resolvedName,
                start: Date.now(),
            };
            
                const realGetRunningGames = RunningGameStoreLocal.getRunningGames;
                const realGetGameForPID = RunningGameStoreLocal.getGameForPID;
                const fakeGames = [fakeGame];
                RunningGameStoreLocal.getRunningGames = () => fakeGames;
                RunningGameStoreLocal.getGameForPID = (checkPid: number) => fakeGames.find((x: any) => x.pid === checkPid);
                const realGames = realGetRunningGames.call(RunningGameStoreLocal);
                FluxDispatcherLocal.dispatch({
                    type: "RUNNING_GAMES_CHANGE",
                    removed: realGames,
                    added: [fakeGame],
                    games: fakeGames,
                });
                debugLog(`[QuestAutoComplete] Spoofed game: ${resolvedName} (pid: ${pid}, id: ${applicationId ?? "MISSING"})`);

                let lastServerProgress = currentProgress;
                const startTime = Date.now();

                const updateTicker = setInterval(() => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            clearInterval(updateTicker);
                            return;
                        }

                        const liveQuest = QuestsStore?.getQuest?.(quest.id);
                        const liveProgress = Math.floor(
                            liveQuest?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
                            liveQuest?.userStatus?.streamProgressSeconds ??
                            lastServerProgress
                        );

                        if (liveProgress > lastServerProgress) {
                            lastServerProgress = liveProgress;
                        }

                        const elapsed = Math.floor((Date.now() - startTime) / 1000);
                        const estimatedProgress = Math.min(secondsNeeded, Math.max(lastServerProgress, currentProgress + elapsed));

                        const percent = liveProgress >= secondsNeeded
                            ? 100
                            : Math.min(99, Math.floor((estimatedProgress / secondsNeeded) * 100));

                        updateProgressBar(quest.id, userId, percent);

                        if (liveProgress >= secondsNeeded) {
                            clearInterval(updateTicker);
                            debugLog("[QuestAutoComplete] Quest completed on backend!");
                            RunningGameStoreLocal.getRunningGames = realGetRunningGames;
                            RunningGameStoreLocal.getGameForPID = realGetGameForPID;
                            FluxDispatcherLocal.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                            FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                            const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Play Quest";
                            completeQuestPill(quest.id, `${questName} Completed!`, true);
                            cleanupQuest(quest.id, userId);
                            resolve(true);
                        }
                    } catch (e) { }
                }, 1000);

                const heartbeatHandler = (data: any) => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            clearInterval(updateTicker);
                            RunningGameStoreLocal.getRunningGames = realGetRunningGames;
                            RunningGameStoreLocal.getGameForPID = realGetGameForPID;
                            FluxDispatcherLocal.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                            FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                            removeProgressBar(quest.id, userId);
                            resolve(false);
                            return;
                        }

                        const liveQuest = QuestsStore?.getQuest?.(quest.id);
                        const progress = Math.floor(
                            liveQuest?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
                            data?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
                            data?.progress?.PLAY_ON_DESKTOP?.value ??
                            data?.userStatus?.streamProgressSeconds ??
                            lastServerProgress
                        );

                        if (progress > lastServerProgress) {
                            lastServerProgress = progress;
                        }

                        const percent = progress >= secondsNeeded ? 100 : Math.min(99, Math.floor((progress / secondsNeeded) * 100));
                        updateProgressBar(quest.id, userId, percent);
                        debugLog(`[QuestAutoComplete] Quest progress: ${progress}/${secondsNeeded} (${percent}%)`);

                        if (progress >= secondsNeeded) {
                            clearInterval(updateTicker);
                            debugLog("[QuestAutoComplete] Quest completed!");
                            RunningGameStoreLocal.getRunningGames = realGetRunningGames;
                            RunningGameStoreLocal.getGameForPID = realGetGameForPID;
                            FluxDispatcherLocal.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                            FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                            const questName = quest.config?.messages?.questName ?? quest.messages?.questName ?? "Play Quest";
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
                        clearInterval(updateTicker);
                        RunningGameStoreLocal.getRunningGames = realGetRunningGames;
                        RunningGameStoreLocal.getGameForPID = realGetGameForPID;
                        FluxDispatcherLocal.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                        FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                    } catch (e) { }
                });
                cleanupFunctions.set(key, cleanups);

        } catch (error: any) {
            console.error("[QuestAutoComplete] Failed to complete play quest:", error);
            notify("Quest Error", `Failed: ${error?.message || "Unknown error"}`, "error", quest.id);
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            resolve(false);
        }
    });
}
