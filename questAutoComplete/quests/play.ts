import { discordApiGet } from "../core/api";
import { settings } from "../index";
import { activeQuests, cleanupFunctions, getProgressBarKey, isPluginStopping } from "../core/state";
import { findFluxDispatcher } from "../core/stores";
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
    const applicationId = quest.config?.application?.id ?? quest.application?.id;
    const applicationName = quest.config?.application?.name ?? quest.application?.name ?? "Unknown App";
    const currentProgress = quest.userStatus?.progress?.PLAY_ON_DESKTOP?.value ?? 0;
    updateQuestPill(quest.id, `Auto-completing: ${applicationName}. Wait ~${Math.ceil((secondsNeeded - currentProgress) / 60)} minutes.`, 0);
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
            discordApiGet(`/applications/public?application_ids=${applicationId}`).then(async appDataResponse => {
                const appData = appDataResponse[0];
                const exeName = appData?.executables?.find((x: any) => x.os === "win32")?.name?.replace(">", "")
                    || `${applicationName.toLowerCase().replace(/\s+/g, "")}.exe`;
                const fakeGame = {
                    cmdLine: `C:\\Program Files\\${appData?.name || applicationName}\\${exeName}`,
                    exeName,
                    exePath: `c:/program files/${(appData?.name || applicationName).toLowerCase()}/${exeName}`,
                    hidden: false,
                    isLauncher: false,
                    id: applicationId,
                    name: appData?.name || applicationName,
                    pid: pid,
                    pidPath: [pid],
                    processName: appData?.name || applicationName,
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
                console.log(`[QuestAutoComplete] Spoofed game: ${applicationName} (pid: ${pid})`);
                const heartbeatHandler = (data: any) => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            RunningGameStoreLocal.getRunningGames = realGetRunningGames;
                            RunningGameStoreLocal.getGameForPID = realGetGameForPID;
                            FluxDispatcherLocal.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                            FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                            removeProgressBar(quest.id, userId);
                            resolve(false);
                            return;
                        }
                        const configVersion = quest.config?.configVersion ?? quest.configVersion;
                        const progress = configVersion === 1
                            ? data.userStatus.streamProgressSeconds
                            : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                        const percent = Math.min(100, (progress / secondsNeeded) * 100);
                        updateProgressBar(quest.id, userId, percent);
                        console.log(`[QuestAutoComplete] Quest progress: ${progress}/${secondsNeeded}`);
                        if (progress >= secondsNeeded) {
                            console.log("[QuestAutoComplete] Quest completed!");
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
                        RunningGameStoreLocal.getRunningGames = realGetRunningGames;
                        RunningGameStoreLocal.getGameForPID = realGetGameForPID;
                        FluxDispatcherLocal.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                        FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                    } catch (e) { }
                });
                cleanupFunctions.set(key, cleanups);
            }).catch(error => {
                console.error("[QuestAutoComplete] Failed to get application data:", error);
                notify("Quest Error", `Failed to get app data: ${error?.message || "Unknown error"}`, "error", quest.id);
                removeProgressBar(quest.id, userId);
                cleanupQuest(quest.id, userId);
                resolve(false);
            });
        } catch (error: any) {
            console.error("[QuestAutoComplete] Failed to complete play quest:", error);
            notify("Quest Error", `Failed: ${error?.message || "Unknown error"}`, "error", quest.id);
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            resolve(false);
        }
    });
}
