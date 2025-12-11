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
 * Version: 1.0.2
 * Credits:
 * - Original script concept from the Discord community
 * - Enhanced and converted to Vencord plugin by BlockTol
 *
 * Disclaimer:
 * This plugin is for educational purposes only.
 * Use at your own risk. The author is not responsible for any
 * consequences including but not limited to account suspension.
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, Toasts } from "@webpack/common";

const PLUGIN_VERSION = "1.0.2";
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
        description: "Check for plugin updates automatically on Discord startup",
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
    const notification = document.createElement("div");
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: var(--background-floating);
        border-radius: 8px;
        padding: 16px;
        width: 360px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        animation: slideInLeft 0.3s ease;
        border: 1px solid var(--background-modifier-accent);
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#5865F2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <div style="flex: 1;">
                <h3 style="margin: 0; color: var(--header-primary); font-size: 16px; font-weight: 600;">
                    ${update.critical ? "Critical Update" : "Update Available"}
                </h3>
                <p style="margin: 4px 0 0 0; color: var(--text-muted); font-size: 12px;">
                    v${PLUGIN_VERSION} → v${update.version}
                </p>
            </div>
            <button id="close-update-notif" style="
                background: none;
                border: none;
                color: var(--interactive-normal);
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
                </svg>
            </button>
        </div>

        <div style="background: var(--background-secondary); padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <p style="margin: 0 0 6px 0; color: var(--header-secondary); font-size: 12px; font-weight: 600;">
                What's New:
            </p>
            <ul style="margin: 0; padding-left: 16px; color: var(--text-normal); font-size: 12px;">
                ${update.changelog.map(item => `<li style="margin: 2px 0;">${item}</li>`).join('')}
            </ul>
        </div>

        ${update.critical ? `
            <div style="background: #faa61a20; border: 1px solid #faa61a; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
                <p style="margin: 0; color: #faa61a; font-size: 11px; font-weight: 500;">
                    Critical update with important fixes
                </p>
            </div>
        ` : ''}

        <div style="display: flex; gap: 8px;">
            <button id="ignore-update-btn" style="
                flex: 1;
                padding: 8px;
                background: var(--background-secondary);
                color: var(--text-normal);
                border: none;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
            ">
                ${update.critical ? "Later" : "Ignore"}
            </button>
            <button id="download-update-btn" style="
                flex: 1;
                padding: 8px;
                background: var(--brand-experiment);
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
            ">
                Download
            </button>
        </div>
    `;

    if (!document.getElementById("update-notif-styles")) {
        const style = document.createElement("style");
        style.id = "update-notif-styles";
        style.textContent = `
            @keyframes slideInLeft {
                from { transform: translateX(-100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    const closeBtn = notification.querySelector("#close-update-notif") as HTMLButtonElement;
    const ignoreBtn = notification.querySelector("#ignore-update-btn") as HTMLButtonElement;
    const downloadBtn = notification.querySelector("#download-update-btn") as HTMLButtonElement;

    closeBtn.onmouseover = () => closeBtn.style.color = "var(--interactive-hover)";
    closeBtn.onmouseout = () => closeBtn.style.color = "var(--interactive-normal)";
    closeBtn.onclick = () => notification.remove();

    ignoreBtn.onmouseover = () => ignoreBtn.style.background = "var(--background-tertiary)";
    ignoreBtn.onmouseout = () => ignoreBtn.style.background = "var(--background-secondary)";
    ignoreBtn.onclick = () => {
        if (!update.critical) {
            settings.store.ignoredVersion = update.version;
        }
        notification.remove();
    };

    downloadBtn.onmouseover = () => downloadBtn.style.background = "#4752c4";
    downloadBtn.onmouseout = () => downloadBtn.style.background = "var(--brand-experiment)";
    downloadBtn.onclick = () => {
        window.open(update.downloadUrl, "_blank");
        notification.remove();
        showToastNotification("Opening download page...", "info");
    };

    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.style.animation = "slideOutLeft 0.3s ease";
            setTimeout(() => notification.remove(), 300);
        }
    }, 15000);
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
            showToastNotification("You're using the latest version!", "success");
        }

        settings.store.lastUpdateCheck = Date.now().toString();

    } catch (error) {
        console.error("[QuestAutoComplete] Update check error:", error);
    }

    return null;
}

// ==================== Progress Bar ====================
function createProgressBar() {
    if (progressBar) {
        progressBar.remove();
    }

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
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 15px rgba(88, 101, 242, 0.6);
        animation: shimmer 2s infinite;
    `;

    if (!document.getElementById("progress-bar-styles")) {
        const style = document.createElement("style");
        style.id = "progress-bar-styles";
        style.textContent = `
            @keyframes shimmer {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            @keyframes slideOutLeft {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(-100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(progressBar);
    void progressBar.offsetWidth;

    return progressBar;
}

function updateProgressBar(percent: number) {
    if (!settings.store.showProgressBar) return;

    if (!progressBar) {
        createProgressBar();
    }

    if (progressBar) {
        const clampedPercent = Math.min(100, Math.max(0, percent));
        progressBar.style.width = `${clampedPercent}%`;

        if (clampedPercent >= 100) {
            setTimeout(() => {
                if (progressBar) {
                    progressBar.style.transition = "opacity 0.5s ease";
                    progressBar.style.opacity = "0";
                    setTimeout(() => {
                        progressBar?.remove();
                        progressBar = null;
                    }, 500);
                }
            }, 300);
        }
    }
}

function removeProgressBar() {
    if (progressBar) {
        progressBar.style.transition = "opacity 0.3s ease";
        progressBar.style.opacity = "0";
        setTimeout(() => {
            progressBar?.remove();
            progressBar = null;
        }, 300);
    }
}

// ==================== Toast Notifications ====================
function showToastNotification(message: string, type: "success" | "info" | "warning" | "error" = "success") {
    const toast = document.createElement("div");

    const colors = {
        success: "#43b581",
        info: "#5865F2",
        warning: "#faa61a",
        error: "#f04747"
    };

    const icons = {
        success: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
        info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
        warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
        error: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'
    };

    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: var(--background-floating);
        border-left: 3px solid ${colors[type]};
        border-radius: 4px;
        padding: 12px 16px;
        min-width: 300px;
        max-width: 400px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        z-index: 10001;
        animation: slideInLeft 0.3s ease;
        display: flex;
        align-items: center;
        gap: 12px;
    `;

    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${colors[type]}">
            ${icons[type]}
        </svg>
        <span style="color: var(--text-normal); font-size: 14px; flex: 1;">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.style.animation = "slideOutLeft 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);
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

    if (settings.store.showProgressBar) {
        createProgressBar();ش
        updateProgressBar(0);
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
    showToastNotification(`Quest completed: ${quest.config.messages.questName}`, "success");
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

    if (settings.store.showProgressBar) {
        createProgressBar();
        updateProgressBar(0);
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

                showToastNotification(`Quest completed: ${quest.config.messages.questName}`, "success");
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

    if (settings.store.showProgressBar) {
        createProgressBar();
        updateProgressBar(0);
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

            showToastNotification(`Quest completed: ${quest.config.messages.questName}`, "success");
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

    if (settings.store.showProgressBar) {
        createProgressBar();
        updateProgressBar(0);
    }

    const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ??
        Object.values(GuildChannelStore.getAllGuilds()).find((x: any) => x?.VOCAL?.length > 0)?.VOCAL[0]?.channel?.id;

    if (!channelId) {
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
        showToastNotification(`Quest completed: ${quest.config.messages.questName}`, "success");
        isProcessing = false;
        currentQuestId = null;
        return true;
    } catch (error) {
        console.error("[QuestAutoComplete] Activity quest error:", error);
        removeProgressBar();
        isProcessing = false;
        return false;
    }
}

// ==================== Main Quest Handler ====================
async function checkAndStartQuest() {
    if (isProcessing || !settings.store.autoStart) return;
    if (!QuestsStore) return;

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

        showToastNotification(`Quest detected: ${activeQuest.config.messages.questName}`, "info");

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
                    isProcessing = false;
                    currentQuestId = null;
                }
                break;
            case "STREAM_ON_DESKTOP":
                if (isDesktopApp) {
                    await completeStreamQuest(activeQuest);
                } else {
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
        console.log("[QuestAutoComplete] Plugin started");

        setTimeout(() => {
            if (initializeStores()) {
                checkAndStartQuest();
                setupNavigationWatcher();

                if (settings.store.checkUpdates) {
                    checkForUpdates(true);
                }
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
    }
});
