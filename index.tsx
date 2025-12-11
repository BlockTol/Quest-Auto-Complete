/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * QuestAutoComplete Plugin
 *
 * Created by: BlockTol
 * GitHub: https://github.com/BlockTol
 * Discord: @dhrtjhjtd
 * Description: Automatically completes Discord quests instantly!
 * Version: 1.0.0
 * Credits:
 * - Original script concept from the Discord community
 * - Enhanced and converted to Vencord plugin by BlockTol
 *
 * ⚠️ Disclaimer:
 * This plugin is for educational purposes only.
 * Use at your own risk. The author is not responsible for any
 * consequences including but not limited to account suspension.
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, Toasts } from "@webpack/common";
import { showNotification } from "@api/Notifications";

const PLUGIN_VERSION = "1.0.0";
const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/BlockTol/Quest-Auto-Complete/refs/heads/main/version.json";

// ==================== Types ====================
interface Quest {
    id: string;
    config: {
        application: { id: string; name: string };
        expiresAt: string;
        messages: { questName: string };
        taskConfig?: any;
        taskConfigV2?: any;
        configVersion: number;
    };
    userStatus: {
        enrolledAt: string;
        completedAt?: string;
        progress?: any;
        streamProgressSeconds?: number;
    };
}

interface UpdateInfo {
    version: string;
    changelog: string[];
    downloadUrl: string;
    critical: boolean;
}

// ==================== Global Variables ====================
let QuestsStore: any;
let RunningGameStore: any;
let ApplicationStreamingStore: any;
let ChannelStore: any;
let GuildChannelStore: any;
let api: any;

let isProcessing = false;
let currentQuestId: string | null = null;
let progressBar: HTMLElement | null = null;
let cleanupFunctions: Array<() => void> = [];
let questPageButton: HTMLElement | null = null;
let navigationObserver: MutationObserver | null = null;
let lastQuestUrl = "";

// ==================== Settings ====================
const settings = definePluginSettings({
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically start quest completion when you accept a quest",
        default: true,
        restartNeeded: false
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show toast notifications for quest progress",
        default: true,
        restartNeeded: false
    },
    showProgressBar: {
        type: OptionType.BOOLEAN,
        description: "Show animated progress bar at the top of the screen",
        default: true,
        restartNeeded: false
    },
    skipVideos: {
        type: OptionType.BOOLEAN,
        description: "Instantly complete video quests without watching",
        default: true,
        restartNeeded: false
    },
    completionSpeed: {
        type: OptionType.SLIDER,
        description: "Video completion speed multiplier (1-20, higher = faster but more suspicious)",
        default: 10,
        markers: [1, 3, 5, 7, 10, 15, 20],
        stickToMarkers: true,
        restartNeeded: false
    },
    checkUpdates: {
        type: OptionType.BOOLEAN,
        description: "Check for plugin updates automatically",
        default: true,
        restartNeeded: false
    },
    lastUpdateCheck: {
        type: OptionType.STRING,
        description: "Last update check timestamp (hidden)",
        default: "0",
        hidden: true
    },
    ignoredVersion: {
        type: OptionType.STRING,
        description: "Ignored update version (hidden)",
        default: "",
        hidden: true
    },
    checkUpdateBtn: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => (
            <button
                onClick={() => {
                    notify("Checking Updates", "Please wait...", "info");
                    checkForUpdates(true);
                }}
                style={{
                    padding: "10px 20px",
                    background: "var(--brand-experiment)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: "pointer",
                    width: "100%",
                    marginTop: "8px",
                    transition: "all 0.2s"
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#4752c4")}
                onMouseOut={(e) => (e.currentTarget.style.background = "var(--brand-experiment)")}
            >
                🔄 Check for Updates Now
            </button>
        )
    },
    versionInfo: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => (
            <div style={{
                padding: "12px",
                background: "var(--background-secondary)",
                borderRadius: "4px",
                marginTop: "8px"
            }}>
                <p style={{
                    margin: 0,
                    color: "var(--text-muted)",
                    fontSize: "12px"
                }}>
                    Current Version: <strong style={{color: "var(--text-normal)"}}>{PLUGIN_VERSION}</strong>
                </p>
            </div>
        )
    },
    showCredits: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => (
            <div style={{
                padding: "16px",
                background: "var(--background-secondary)",
                borderRadius: "8px",
                marginTop: "16px"
            }}>
                <h3 style={{
                    color: "var(--header-primary)",
                    marginBottom: "8px",
                    fontSize: "16px",
                    fontWeight: "600"
                }}>
                    🎮 QuestAutoComplete v{PLUGIN_VERSION}
                </h3>
                <p style={{
                    color: "var(--text-normal)",
                    marginBottom: "8px",
                    fontSize: "14px"
                }}>
                    Created by <strong>BlockTol</strong>
                </p>
                <p style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginBottom: "12px"
                }}>
                    Automatically completes Discord quests instantly. Save time and earn rewards effortlessly!
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <a
                        href="https://github.com/BlockTol"
                        target="_blank"
                        style={{
                            padding: "6px 12px",
                            background: "var(--brand-experiment)",
                            color: "white",
                            borderRadius: "4px",
                            textDecoration: "none",
                            fontSize: "12px",
                            fontWeight: "500"
                        }}
                    >
                        GitHub
                    </a>
                    <a
                        href="https://discord.com/users/1172069050424250432"
                        target="_blank"
                        style={{
                            padding: "6px 12px",
                            background: "#5865F2",
                            color: "white",
                            borderRadius: "4px",
                            textDecoration: "none",
                            fontSize: "12px",
                            fontWeight: "500"
                        }}
                    >
                        Discord
                    </a>
                </div>
                <p style={{
                    color: "var(--text-danger)",
                    fontSize: "11px",
                    marginTop: "12px",
                    fontStyle: "italic"
                }}>
                    Use at your own risk. This may violate Discord's Terms of Service.
                </p>
            </div>
        )
    }
});

// ==================== Store Initialization ====================
function initializeStores() {
    try {
        const wpRequire = (window as any).webpackChunkdiscord_app.push([
            [Symbol()],
            {},
            (req: any) => req
        ]);
        (window as any).webpackChunkdiscord_app.pop();

        const modules = Object.values(wpRequire.c);

        QuestsStore = modules.find((x: any) => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z;
        RunningGameStore = modules.find((x: any) => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
        ApplicationStreamingStore = modules.find((x: any) => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z;
        ChannelStore = modules.find((x: any) => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.exports?.Z;
        GuildChannelStore = modules.find((x: any) => x?.exports?.ZP?.getSFWDefaultChannel)?.exports?.ZP;
        api = modules.find((x: any) => x?.exports?.tn?.get)?.exports?.tn;

        console.log("[QuestAutoComplete] Stores initialized successfully");
        return true;
    } catch (error) {
        console.error("[QuestAutoComplete] Failed to initialize stores:", error);
        return false;
    }
}

// ==================== Update Checker ====================
function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }

    return 0;
}

function showUpdateNotification(update: UpdateInfo) {
    const modal = document.createElement("div");
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
        background: var(--background-primary);
        border-radius: 8px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        animation: slideUp 0.3s ease;
    `;

    content.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#5865F2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <div>
                <h2 style="margin: 0; color: var(--header-primary); font-size: 20px; font-weight: 600;">
                    ${update.critical ? "⚠️ Critical Update Available" : "🎉 Update Available"}
                </h2>
                <p style="margin: 4px 0 0 0; color: var(--text-muted); font-size: 14px;">
                    v${PLUGIN_VERSION} → v${update.version}
                </p>
            </div>
        </div>

        <div style="background: var(--background-secondary); padding: 16px; border-radius: 4px; margin-bottom: 16px;">
            <h3 style="margin: 0 0 8px 0; color: var(--header-secondary); font-size: 14px; font-weight: 600;">
                📝 What's New:
            </h3>
            <ul style="margin: 0; padding-left: 20px; color: var(--text-normal); font-size: 13px;">
                ${update.changelog.map(item => `<li style="margin: 4px 0;">${item}</li>`).join('')}
            </ul>
        </div>

        ${update.critical ? `
            <div style="background: #faa61a20; border: 1px solid #faa61a; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
                <p style="margin: 0; color: #faa61a; font-size: 13px; font-weight: 500;">
                    ⚠️ This is a critical update with important bug fixes or security improvements.
                </p>
            </div>
        ` : ''}

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="ignore-btn" style="
                padding: 10px 20px;
                background: var(--background-secondary);
                color: var(--text-normal);
                border: none;
                border-radius: 4px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            ">
                ${update.critical ? "Remind Later" : "Ignore"}
            </button>
            <button id="update-btn" style="
                padding: 10px 20px;
                background: var(--brand-experiment);
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            ">
                📥 Download Update
            </button>
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Add animation styles
    if (!document.getElementById("update-modal-styles")) {
        const style = document.createElement("style");
        style.id = "update-modal-styles";
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    const updateBtn = content.querySelector("#update-btn") as HTMLButtonElement;
    const ignoreBtn = content.querySelector("#ignore-btn") as HTMLButtonElement;

    updateBtn.onmouseover = () => updateBtn.style.background = "#4752c4";
    updateBtn.onmouseout = () => updateBtn.style.background = "var(--brand-experiment)";

    ignoreBtn.onmouseover = () => ignoreBtn.style.background = "var(--background-tertiary)";
    ignoreBtn.onmouseout = () => ignoreBtn.style.background = "var(--background-secondary)";

    updateBtn.onclick = () => {
        window.open(update.downloadUrl, "_blank");
        modal.remove();
        notify("Update", "Opening download page...", "info");
    };

    ignoreBtn.onclick = () => {
        if (!update.critical) {
            settings.store.ignoredVersion = update.version;
        }
        modal.remove();
    };

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

async function checkForUpdates(showNotification = true): Promise<UpdateInfo | null> {
    if (!settings.store.checkUpdates) return null;

    try {
        const response = await fetch(UPDATE_CHECK_URL, {
            cache: "no-cache",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            console.error("[QuestAutoComplete] Update check failed:", response.status);
            return null;
        }

        const updateInfo: UpdateInfo = await response.json();

        if (compareVersions(updateInfo.version, PLUGIN_VERSION) > 0) {
            if (updateInfo.version !== settings.store.ignoredVersion) {
                if (showNotification) {
                    showUpdateNotification(updateInfo);
                }
                return updateInfo;
            }
        } else if (showNotification) {
            notify("No Updates", "You're using the latest version!", "success");
        }

        settings.store.lastUpdateCheck = Date.now().toString();

    } catch (error) {
        console.error("[QuestAutoComplete] Update check error:", error);
    }

    return null;
}

function shouldCheckForUpdates(): boolean {
    if (!settings.store.checkUpdates) return false;

    const lastCheck = parseInt(settings.store.lastUpdateCheck || "0");
    const now = Date.now();

    return (now - lastCheck) >= UPDATE_INTERVAL;
}

// ==================== Progress Bar ====================
function createProgressBar() {
    if (progressBar) return progressBar;

    progressBar = document.createElement("div");
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 4px;
        background: linear-gradient(90deg, #5865F2, #7289DA, #5865F2);
        background-size: 200% 100%;
        z-index: 9999;
        transition: width 0.3s ease;
        box-shadow: 0 0 15px rgba(88, 101, 242, 0.6);
        animation: shimmer 2s infinite;
    `;

    const style = document.createElement("style");
    style.textContent = `
        @keyframes shimmer {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(progressBar);
    return progressBar;
}

function updateProgressBar(percent: number) {
    if (!progressBar) return;
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (percent >= 100) {
        setTimeout(() => {
            progressBar?.remove();
            progressBar = null;
        }, 800);
    }
}

function removeProgressBar() {
    if (progressBar) {
        progressBar.remove();
        progressBar = null;
    }
}

// ==================== Notifications ====================
function notify(title: string, body: string, type: "success" | "info" | "error" = "info") {
    if (settings.store.showNotifications) {
        const icon = type === "success" ? "✅" : type === "error" ? "❌" : "🎮";
        showNotification({
            title,
            body,
            icon
        });
    }

    Toasts.show({
        message: `${title}: ${body}`,
        type: type === "error" ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS,
        id: "quest-autocomplete-" + Date.now()
    });
}

// ==================== Quest Completion Functions ====================
async function completeVideoQuest(quest: Quest) {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE"].find(x => taskConfig.tasks[x] != null);
    if (!taskName) return false;

    const secondsNeeded = taskConfig.tasks[taskName].target;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    const maxFuture = 10;
    const speed = settings.store.completionSpeed || 10;
    const interval = 1;
    const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
    let completed = false;

    notify("Quest Started", `Auto-completing: ${quest.config.messages.questName}`, "info");

    if (settings.store.showProgressBar) {
        createProgressBar();
    }

    while (true) {
        const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
        const diff = maxAllowed - secondsDone;
        const timestamp = secondsDone + speed;

        if (diff >= speed) {
            try {
                const res = await api.post({
                    url: `/quests/${quest.id}/video-progress`,
                    body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) }
                });
                completed = res.body.completed_at != null;
                secondsDone = Math.min(secondsNeeded, timestamp);

                const progress = (secondsDone / secondsNeeded) * 100;
                updateProgressBar(progress);
            } catch (error) {
                console.error("[QuestAutoComplete] Progress error:", error);
                notify("Quest Error", "Failed to update progress", "error");
                removeProgressBar();
                return false;
            }
        }

        if (timestamp >= secondsNeeded) break;
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }

    if (!completed) {
        await api.post({
            url: `/quests/${quest.id}/video-progress`,
            body: { timestamp: secondsNeeded }
        });
    }

    updateProgressBar(100);
    notify("Quest Completed!", quest.config.messages.questName, "success");
    isProcessing = false;
    currentQuestId = null;
    return true;
}

async function completePlayQuest(quest: Quest) {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig.tasks.PLAY_ON_DESKTOP.target;

    const applicationId = quest.config.application.id;
    const applicationName = quest.config.application.name;
    const pid = Math.floor(Math.random() * 30000) + 1000;

    notify("Quest Started", `Spoofing game: ${applicationName}`, "info");

    if (settings.store.showProgressBar) {
        createProgressBar();
    }

    try {
        const res = await api.get({ url: `/applications/public?application_ids=${applicationId}` });
        const appData = res.body[0];
        const exeName = appData.executables.find((x: any) => x.os === "win32")?.name?.replace(">", "") || "Game.exe";

        const fakeGame = {
            cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
            exeName,
            exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: applicationId,
            name: appData.name,
            pid: pid,
            pidPath: [pid],
            processName: appData.name,
            start: Date.now(),
        };

        const realGames = RunningGameStore.getRunningGames();
        const realGetRunningGames = RunningGameStore.getRunningGames;
        const realGetGameForPID = RunningGameStore.getGameForPID;

        RunningGameStore.getRunningGames = () => [fakeGame];
        RunningGameStore.getGameForPID = (p: number) => p === pid ? fakeGame : null;
        FluxDispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            removed: realGames,
            added: [fakeGame],
            games: [fakeGame]
        });

        const handleProgress = (data: any) => {
            let progress = quest.config.configVersion === 1
                ? data.userStatus.streamProgressSeconds
                : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);

            const percent = (progress / secondsNeeded) * 100;
            updateProgressBar(percent);

            if (progress >= secondsNeeded) {
                RunningGameStore.getRunningGames = realGetRunningGames;
                RunningGameStore.getGameForPID = realGetGameForPID;
                FluxDispatcher.dispatch({
                    type: "RUNNING_GAMES_CHANGE",
                    removed: [fakeGame],
                    added: [],
                    games: []
                });
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handleProgress);

                notify("Quest Completed!", quest.config.messages.questName, "success");
                isProcessing = false;
                currentQuestId = null;
            }
        };

        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handleProgress);
        cleanupFunctions.push(() => {
            RunningGameStore.getRunningGames = realGetRunningGames;
            RunningGameStore.getGameForPID = realGetGameForPID;
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handleProgress);
        });

        return true;
    } catch (error) {
        console.error("[QuestAutoComplete] Play quest error:", error);
        notify("Quest Error", "Failed to spoof game", "error");
        removeProgressBar();
        isProcessing = false;
        return false;
    }
}

async function completeStreamQuest(quest: Quest) {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig.tasks.STREAM_ON_DESKTOP.target;

    const applicationId = quest.config.application.id;
    const applicationName = quest.config.application.name;
    const pid = Math.floor(Math.random() * 30000) + 1000;

    notify("Quest Started", `Spoofing stream: ${applicationName}`, "info");

    if (settings.store.showProgressBar) {
        createProgressBar();
    }

    const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
    ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
        id: applicationId,
        pid,
        sourceName: null
    });

    const handleProgress = (data: any) => {
        let progress = quest.config.configVersion === 1
            ? data.userStatus.streamProgressSeconds
            : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);

        const percent = (progress / secondsNeeded) * 100;
        updateProgressBar(percent);

        if (progress >= secondsNeeded) {
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handleProgress);

            notify("Quest Completed!", quest.config.messages.questName, "success");
            isProcessing = false;
            currentQuestId = null;
        }
    };

    FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handleProgress);
    cleanupFunctions.push(() => {
        ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
        FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handleProgress);
    });

    return true;
}

async function completeActivityQuest(quest: Quest) {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig.tasks.PLAY_ACTIVITY.target;

    notify("Quest Started", `Completing: ${quest.config.messages.questName}`, "info");

    if (settings.store.showProgressBar) {
        createProgressBar();
    }

    const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ??
        Object.values(GuildChannelStore.getAllGuilds()).find((x: any) => x?.VOCAL?.length > 0)?.VOCAL[0]?.channel?.id;

    if (!channelId) {
        notify("Quest Error", "No voice channel found", "error");
        removeProgressBar();
        isProcessing = false;
        return false;
    }

    const streamKey = `call:${channelId}:1`;

    try {
        while (true) {
            const res = await api.post({
                url: `/quests/${quest.id}/heartbeat`,
                body: { stream_key: streamKey, terminal: false }
            });
            const progress = res.body.progress.PLAY_ACTIVITY.value;
            const percent = (progress / secondsNeeded) * 100;
            updateProgressBar(percent);

            if (progress >= secondsNeeded) {
                await api.post({
                    url: `/quests/${quest.id}/heartbeat`,
                    body: { stream_key: streamKey, terminal: true }
                });
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 20 * 1000));
        }

        updateProgressBar(100);
        notify("Quest Completed!", quest.config.messages.questName, "success");
        isProcessing = false;
        currentQuestId = null;
        return true;
    } catch (error) {
        console.error("[QuestAutoComplete] Activity quest error:", error);
        notify("Quest Error", "Failed to complete activity", "error");
        removeProgressBar();
        isProcessing = false;
        return false;
    }
}

// ==================== Main Quest Handler ====================
async function checkAndStartQuest() {
    if (isProcessing || !settings.store.autoStart) return;
    if (!QuestsStore) {
        console.log("[QuestAutoComplete] Stores not initialized yet");
        return;
    }

    try {
        const quests = [...QuestsStore.quests.values()];
        const activeQuest = quests.find((q: Quest) =>
            q.id !== "1248385850622869556" &&
            q.userStatus?.enrolledAt &&
            !q.userStatus?.completedAt &&
            new Date(q.config.expiresAt).getTime() > Date.now()
        );

        if (!activeQuest || currentQuestId === activeQuest.id) return;

        currentQuestId = activeQuest.id;
        isProcessing = true;

        const taskConfig = activeQuest.config.taskConfig ?? activeQuest.config.taskConfigV2;
        const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"]
            .find(x => taskConfig.tasks[x] != null);

        if (!taskName) {
            isProcessing = false;
            currentQuestId = null;
            return;
        }

        const isDesktopApp = typeof (window as any).DiscordNative !== "undefined";

        switch (taskName) {
            case "WATCH_VIDEO":
            case "WATCH_VIDEO_ON_MOBILE":
                if (settings.store.skipVideos) {
                    await completeVideoQuest(activeQuest);
                } else {
                    isProcessing = false;
                    currentQuestId = null;
                }
                break;
            case "PLAY_ON_DESKTOP":
                if (isDesktopApp) {
                    await completePlayQuest(activeQuest);
                } else {
                    notify("Desktop Required", "This quest requires Discord desktop app", "error");
                    isProcessing = false;
                    currentQuestId = null;
                }
                break;
            case "STREAM_ON_DESKTOP":
                if (isDesktopApp) {
                    await completeStreamQuest(activeQuest);
                } else {
                    notify("Desktop Required", "This quest requires Discord desktop app", "error");
                    isProcessing = false;
                    currentQuestId = null;
                }
                break;
            case "PLAY_ACTIVITY":
                await completeActivityQuest(activeQuest);
                break;
        }
    } catch (error) {
        console.error("[QuestAutoComplete] Error:", error);
        notify("Quest Error", "An unexpected error occurred", "error");
        isProcessing = false;
        currentQuestId = null;
        removeProgressBar();
    }
}

// ==================== Plugin Export ====================
export default definePlugin({
    name: "QuestAutoComplete",
    description: "Automatically completes Discord quests when accepted. Skip videos instantly and earn rewards effortlessly!",
    authors: [
        {
            id: 1172069050424250432n,
            name: "BlockTol",
        }
    ],
    tags: ["Quest", "Automation", "Rewards"],

    settings,

    flux: {
        async QUESTS_FETCH_CURRENT_QUESTS_SUCCESS() {
            await checkAndStartQuest();
        },

        async QUEST_CLAIM() {
            setTimeout(() => checkAndStartQuest(), 1000);
        }
    },

    start() {
        console.log("[QuestAutoComplete] Plugin started by BlockTol");

        setTimeout(() => {
            if (initializeStores()) {
                notify("QuestAutoComplete", "Plugin activated! Quests will auto-complete.", "success");
                checkAndStartQuest();
                setupNavigationWatcher();

            } else {
                notify("QuestAutoComplete", "Failed to initialize. Try restarting Discord.", "error");
            }
        }, 2000);
    },

    stop() {
        console.log("[QuestAutoComplete] Plugin stopped");
        isProcessing = false;
        currentQuestId = null;
        removeProgressBar();
        cleanupFunctions.forEach(fn => fn());
        cleanupFunctions = [];

        if (questPageButton) {
            questPageButton.remove();
            questPageButton = null;
        }

        if (navigationObserver) {
            navigationObserver.disconnect();
            navigationObserver = null;
        }

        notify("QuestAutoComplete", "Plugin deactivated", "info");
    }
});
