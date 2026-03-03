import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, FluxDispatcher, React, ReactDOM, UserStore } from "@webpack/common";
import { DataStore } from "@api/index";

import { showUpdateModal } from "./UpdateModal";

const openModal = findByPropsLazy("openModal", "closeModal")?.openModal;


export const PLUGIN_VERSION = "1.1.0";
const KEY_SEPARATOR = ":";
export const GITHUB_REPO = "BlockTol/Quest-Auto-Complete";
export const UPDATE_CHECK_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

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

interface QuestData {
    questId: string;
    userId: string;
    isProcessing: boolean;
    timeoutIds: number[];
    intervalIds: number[];
    lastProgress: number;
    targetProgress: number;
}

let QuestsStore: any;
let RunningGameStore: any;
let ApplicationStreamingStore: any;
let ChannelStore: any;
let GuildChannelStore: any;
let api: any;
let cachedToken: string | null = null;

let activeQuests = new Map<string, QuestData>();
let progressBars = new Map<string, HTMLElement>();
let cleanupFunctions = new Map<string, Array<() => void>>();
let questButtonsObserver: MutationObserver | null = null;
let progressUpdateHandlers = new Map<string, any>();
let isPluginStopping = false;
let refreshQuestButtonsRef: (() => void) | null = null;

function getDiscordToken(): string {
    if (cachedToken) return cachedToken;

    try {
        const webpackChunk = (window as any).webpackChunkdiscord_app;
        if (webpackChunk) {
            const wpRequire = webpackChunk.push([
                [Symbol()],
                {},
                (req: any) => req
            ]);
            webpackChunk.pop();

            if (wpRequire?.c) {
                for (const mod of Object.values(wpRequire.c) as any[]) {
                    try {
                        const exports = mod?.exports;
                        if (!exports) continue;

                        const candidates = [exports, exports.default, exports.Z, exports.ZP];
                        for (const candidate of candidates) {
                            if (!candidate || typeof candidate !== 'object') continue;

                            if (candidate._actionHandlers?._dependencyGraph?.nodes) {
                                const nodes = candidate._actionHandlers._dependencyGraph.nodes;
                                for (const nodeKey of Object.keys(nodes)) {
                                    const node = nodes[nodeKey];
                                    if (node?.actionHandler?.store?._token) {
                                        const token = node.actionHandler.store._token;
                                        if (typeof token === 'string' && token.length > 50) {
                                            cachedToken = token;
                                            console.log("[QuestAutoComplete] Token found via FluxStore");
                                            return cachedToken;
                                        }
                                    }
                                }
                            }

                            const keys = Object.keys(candidate);
                            for (const key of keys) {
                                try {
                                    const value = candidate[key];
                                    if (typeof value === 'string' && value.length > 50 && value.length < 200 && /^[A-Za-z0-9._-]+$/.test(value)) {
                                        if (value.split('.').length === 3) {
                                            cachedToken = value;
                                            console.log("[QuestAutoComplete] Token found via direct property");
                                            return cachedToken;
                                        }
                                    }
                                } catch (e) { }
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        if ((window as any).__discordToken) {
            const token = (window as any).__discordToken;
            if (typeof token === 'string' && token.length > 50) {
                cachedToken = token;
                console.log("[QuestAutoComplete] Token obtained from intercepted request");
                return cachedToken;
            }
        }

        try {
            const localToken = localStorage.getItem("token");
            if (localToken) {
                const cleanToken = localToken.replace(/^"|"$/g, '');
                if (cleanToken.length > 50) {
                    cachedToken = cleanToken;
                    console.log("[QuestAutoComplete] Token obtained via localStorage");
                    return cleanToken;
                }
            }
        } catch (e) { }

        if (webpackChunk) {
            const wpRequire = webpackChunk.push([
                [Symbol()],
                {},
                (req: any) => req
            ]);
            webpackChunk.pop();

            if (wpRequire?.c) {
                for (const mod of Object.values(wpRequire.c) as any[]) {
                    try {
                        const exports = mod?.exports;
                        if (!exports) continue;

                        const candidates = [exports, exports.default, exports.Z, exports.ZP];
                        for (const candidate of candidates) {
                            if (!candidate) continue;

                            const proto = Object.getPrototypeOf(candidate);
                            if (proto && typeof proto.getToken === 'function') {
                                try {
                                    const token = proto.getToken.call(candidate);
                                    if (typeof token === 'string' && token.length > 50) {
                                        cachedToken = token;
                                        console.log("[QuestAutoComplete] Token obtained via prototype.getToken");
                                        return cachedToken;
                                    }
                                } catch (e) { }
                            }
                        }
                    } catch (e) { }
                }
            }
        }

    } catch (e) {
        console.error("[QuestAutoComplete] Token extraction error:", e);
    }

    console.error("[QuestAutoComplete] Failed to get Discord token - all methods failed");
    return "";
}

function setupTokenInterceptor() {
    if ((window as any).__tokenInterceptorSetup) return;
    (window as any).__tokenInterceptorSetup = true;

    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
        if (name.toLowerCase() === 'authorization' && value && !value.startsWith('Basic')) {
            (window as any).__discordToken = value;
            if (!cachedToken) {
                cachedToken = value;
                console.log("[QuestAutoComplete] Token captured from XHR request");
            }
        }
        return originalSetRequestHeader.call(this, name, value);
    };
    console.log("[QuestAutoComplete] Token interceptor installed");
}

// Legacy/Helper functions preserved for reference
function spoofRunningGame(applicationId: string, applicationName: string, pid: number): () => void {
    const fakeGame = {
        id: applicationId,
        name: applicationName,
        pid: pid,
        exeName: `${applicationName.toLowerCase().replace(/\s+/g, '')}.exe`,
        isLauncher: false,
        start: Date.now()
    };

    try {
        const webpackChunk = (window as any).webpackChunkdiscord_app;
        if (webpackChunk) {
            const wpRequire = webpackChunk.push([
                [Symbol()],
                {},
                (req: any) => req
            ]);
            webpackChunk.pop();

            if (wpRequire?.c) {
                let FluxDispatcher: any = null;
                for (const mod of Object.values(wpRequire.c) as any[]) {
                    const exports = mod?.exports;
                    if (!exports) continue;
                    const candidates = [exports, exports.default, exports.Z, exports.ZP];
                    for (const candidate of candidates) {
                        if (candidate?.dispatch && candidate?._dispatch && candidate?.subscribe) {
                            FluxDispatcher = candidate;
                            break;
                        }
                    }
                    if (FluxDispatcher) break;
                }

                if (FluxDispatcher) {
                    FluxDispatcher.dispatch({
                        type: "RUNNING_GAMES_CHANGE",
                        added: [fakeGame],
                        removed: [],
                        games: [fakeGame]
                    });
                    console.log(`[QuestAutoComplete] Spoofed game: ${applicationName} (pid: ${pid})`);

                    return () => {
                        try {
                            FluxDispatcher.dispatch({
                                type: "RUNNING_GAMES_CHANGE",
                                added: [],
                                removed: [fakeGame],
                                games: []
                            });
                            console.log(`[QuestAutoComplete] Removed spoofed game: ${applicationName}`);
                        } catch (e) { }
                    };
                }
            }
        }
    } catch (e) {
        console.warn("[QuestAutoComplete] Failed to spoof running game:", e);
    }

    return () => { };
}

function spoofActiveStream(applicationId: string, channelId: string, guildId: string, pid: number): () => void {
    try {
        const webpackChunk = (window as any).webpackChunkdiscord_app;
        if (webpackChunk) {
            const wpRequire = webpackChunk.push([
                [Symbol()],
                {},
                (req: any) => req
            ]);
            webpackChunk.pop();

            if (wpRequire?.c) {
                let FluxDispatcher: any = null;
                for (const mod of Object.values(wpRequire.c) as any[]) {
                    const exports = mod?.exports;
                    if (!exports) continue;
                    const candidates = [exports, exports.default, exports.Z, exports.ZP];
                    for (const candidate of candidates) {
                        if (candidate?.dispatch && candidate?._dispatch && candidate?.subscribe) {
                            FluxDispatcher = candidate;
                            break;
                        }
                    }
                    if (FluxDispatcher) break;
                }

                if (FluxDispatcher) {
                    FluxDispatcher.dispatch({
                        type: "STREAM_CREATE",
                        streamKey: `stream:${applicationId}:${pid}`,
                        rtcServerId: guildId,
                        channelId: channelId,
                        pid: pid,
                        paused: false
                    });
                    console.log(`[QuestAutoComplete] Spoofed stream for app: ${applicationId}`);

                    return () => {
                        try {
                            FluxDispatcher.dispatch({
                                type: "STREAM_DELETE",
                                streamKey: `stream:${applicationId}:${pid}`
                            });
                            console.log(`[QuestAutoComplete] Removed spoofed stream`);
                        } catch (e) { }
                    };
                }
            }
        }
    } catch (e) {
        console.warn("[QuestAutoComplete] Failed to spoof stream:", e);
    }

    return () => { };
}



async function discordApiGet(endpoint: string): Promise<any> {
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");

    const response = await fetch(`https://discord.com/api/v9${endpoint}`, {
        method: 'GET',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const error: any = new Error(`API GET failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

async function discordApiPost(endpoint: string, body: any): Promise<any> {
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");

    const response = await fetch(`https://discord.com/api/v9${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        let errorBody = '';
        try {
            errorBody = await response.text();
            console.error(`[QuestAutoComplete] API Error Body:`, errorBody);
        } catch (e) { }

        const error: any = new Error(`API POST failed: ${response.status}`);
        error.status = response.status;
        error.body = errorBody;
        throw error;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
}

export const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show notifications",
        default: true,
        hidden: true
    },
    notificationDuration: {
        type: OptionType.SLIDER,
        description: "Notification duration",
        default: 4,
        markers: [2, 4, 6, 8, 10],
        hidden: true
    },
    progressBarColor: {
        type: OptionType.STRING,
        description: "Progress bar color",
        default: "#5865F2",
        hidden: true
    }
});

let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

function getThemeVariables() {
    const isDark = document.documentElement.classList.contains('theme-dark');
    return {
        isDark,
        background: isDark ? '#2f3136' : '#ffffff',
        backgroundSecondary: isDark ? '#292b2f' : '#f2f3f5',
        backgroundSecondaryAlt: isDark ? '#292b2f' : '#ebedef',
        backgroundTertiary: isDark ? '#202225' : '#e3e5e8',
        headerPrimary: isDark ? '#ffffff' : '#060607',
        textNormal: isDark ? '#dcddde' : '#2e3338',
        textMuted: isDark ? '#b9bbbe' : '#4e5058',
        brandColor: '#5865f2',
        dangerColor: '#ed4245',
        successColor: '#43b581'
    };
}

function initializeStores(): boolean {
    try {
        const webpackChunk = (window as any).webpackChunkdiscord_app;
        if (!webpackChunk) {
            console.error("[QuestAutoComplete] Webpack not found");
            return false;
        }

        const wpRequire = webpackChunk.push([
            [Symbol()],
            {},
            (req: any) => req
        ]);
        webpackChunk.pop();

        if (!wpRequire?.c) {
            console.error("[QuestAutoComplete] Webpack modules not accessible");
            return false;
        }

        const modules = Object.values(wpRequire.c);

        QuestsStore = modules.find((x: any) => x?.exports?.A?.__proto__?.getQuest)?.exports?.A
            || modules.find((x: any) => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z
            || modules.find((x: any) => x?.exports?.Z?.__proto__?.getQuests)?.exports?.Z
            || modules.find((x: any) => x?.exports?.default?.__proto__?.getQuest)?.exports?.default
            || modules.find((x: any) => x?.exports?.default?.__proto__?.getQuests)?.exports?.default
            || modules.find((x: any) => x?.exports?.ZP?.__proto__?.getQuest)?.exports?.ZP
            || modules.find((x: any) => x?.exports?.ZP?.__proto__?.getQuests)?.exports?.ZP
            || modules.find((x: any) => x?.exports?.__proto__?.getQuest)?.exports
            || modules.find((x: any) => x?.exports?.__proto__?.getQuests)?.exports;

        if (!QuestsStore) {
            for (const mod of modules as any[]) {
                const exp = mod?.exports;
                if (!exp) continue;
                if (exp.getQuest || exp.getQuests) {
                    QuestsStore = exp;
                    break;
                }
                for (const key of Object.keys(exp)) {
                    const val = exp[key];
                    if (val && (val.getQuest || val.getQuests || val?.__proto__?.getQuest || val?.__proto__?.getQuests)) {
                        QuestsStore = val;
                        break;
                    }
                }
                if (QuestsStore) break;
            }
        }

        RunningGameStore = modules.find((x: any) => x?.exports?.Ay?.getRunningGames)?.exports?.Ay
            || modules.find((x: any) => x?.exports?.ZP?.getRunningGames)?.exports?.ZP
            || modules.find((x: any) => x?.exports?.default?.getRunningGames)?.exports?.default
            || modules.find((x: any) => x?.exports?.Z?.getRunningGames)?.exports?.Z;

        ApplicationStreamingStore = modules.find((x: any) => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.A
            || modules.find((x: any) => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z
            || modules.find((x: any) => x?.exports?.default?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.default
            || modules.find((x: any) => x?.exports?.ZP?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.ZP;

        ChannelStore = modules.find((x: any) => x?.exports?.A?.__proto__?.getAllThreadsForParent)?.exports?.A
            || modules.find((x: any) => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.exports?.Z
            || modules.find((x: any) => x?.exports?.default?.__proto__?.getAllThreadsForParent)?.exports?.default
            || modules.find((x: any) => x?.exports?.ZP?.__proto__?.getChannel)?.exports?.ZP;

        GuildChannelStore = modules.find((x: any) => x?.exports?.Ay?.getSFWDefaultChannel)?.exports?.Ay
            || modules.find((x: any) => x?.exports?.ZP?.getSFWDefaultChannel)?.exports?.ZP
            || modules.find((x: any) => x?.exports?.default?.getSFWDefaultChannel)?.exports?.default
            || modules.find((x: any) => x?.exports?.Z?.getSFWDefaultChannel)?.exports?.Z;

        api = modules.find((x: any) => x?.exports?.Bo?.get)?.exports?.Bo
            || modules.find((x: any) => x?.exports?.tn?.get)?.exports?.tn
            || modules.find((x: any) => x?.exports?.HTTP?.get)?.exports?.HTTP
            || modules.find((x: any) => x?.exports?.Z?.get && x?.exports?.Z?.post)?.exports?.Z
            || modules.find((x: any) => x?.exports?.default?.get && x?.exports?.default?.post)?.exports?.default
            || modules.find((x: any) => x?.exports?.ZP?.get && x?.exports?.ZP?.post)?.exports?.ZP;

        if (!api) {
            for (const mod of modules as any[]) {
                const exp = mod?.exports;
                if (!exp) continue;
                for (const key of Object.keys(exp)) {
                    const val = exp[key];
                    if (val && typeof val.get === 'function' && typeof val.post === 'function') {
                        api = val;
                        console.log(`[QuestAutoComplete] Found API at exports.${key}`);
                        break;
                    }
                }
                if (api) break;
            }
        }

        console.log("[QuestAutoComplete] Store status:", {
            QuestsStore: !!QuestsStore,
            RunningGameStore: !!RunningGameStore,
            ApplicationStreamingStore: !!ApplicationStreamingStore,
            ChannelStore: !!ChannelStore,
            GuildChannelStore: !!GuildChannelStore,
            api: !!api
        });

        if (!QuestsStore) {
            console.warn("[QuestAutoComplete] QuestsStore not found - quest features may be limited");
        }

        if (!api) {
            console.warn("[QuestAutoComplete] API not found - quest completion may not work");
        }

        if (!QuestsStore && !api) {
            console.error("[QuestAutoComplete] Critical stores missing - plugin cannot function");
            return false;
        }

        console.log("[QuestAutoComplete] Stores initialized successfully");
        return true;
    } catch (error) {
        console.error("[QuestAutoComplete] Failed to initialize stores:", error);
        return false;
    }
}

function getProgressBarKey(questId: string, userId: string): string {
    return `${questId}${KEY_SEPARATOR}${userId}`;
}

function parseProgressBarKey(key: string): { questId: string; userId: string } | null {
    const parts = key.split(KEY_SEPARATOR);
    if (parts.length !== 2) return null;
    return { questId: parts[0], userId: parts[1] };
}

function safeTimeout(callback: () => void, delay: number, questId: string, userId: string): number {
    const timeoutId = window.setTimeout(callback, delay);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.push(timeoutId);
    }
    return timeoutId;
}

function safeInterval(callback: () => void, interval: number, questId: string, userId: string): number {
    const intervalId = window.setInterval(callback, interval);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.intervalIds.push(intervalId);
    }
    return intervalId;
}

function clearQuestTimers(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.forEach(id => clearTimeout(id));
        questData.intervalIds.forEach(id => clearInterval(id));
        questData.timeoutIds = [];
        questData.intervalIds = [];
    }
}

function getDiscordProgressPercent(questId: string): number | null {
    try {
        const questTile = document.querySelector(`[id="quest-tile-${questId}"]`);
        if (!questTile) {
            return null;
        }

        const allCircles = questTile.querySelectorAll('circle');

        let greenCircle: Element | null = null;

        allCircles.forEach(circle => {
            const stroke = circle.getAttribute('stroke');
            const style = circle.getAttribute('style');

            if (stroke && (stroke.includes('green') || stroke.includes('--green-330'))) {
                greenCircle = circle;
            } else if (style && style.includes('green')) {
                greenCircle = circle;
            }
        });

        if (!greenCircle && allCircles.length >= 2) {
            greenCircle = allCircles[1];
        }

        if (!greenCircle) {
            return null;
        }

        let dashArray = greenCircle.getAttribute('stroke-dasharray');
        let dashOffset = greenCircle.getAttribute('stroke-dashoffset');

        if (!dashArray || !dashOffset) {
            const style = window.getComputedStyle(greenCircle);
            dashArray = dashArray || style.strokeDasharray;
            dashOffset = dashOffset || style.strokeDashoffset;
        }

        if (!dashArray || !dashOffset || dashArray === 'none' || dashOffset === 'none') {
            return null;
        }

        const circumferenceMatch = dashArray.match(/[\d.]+/);
        if (!circumferenceMatch) return null;

        const circumference = parseFloat(circumferenceMatch[0]);
        const offset = parseFloat(dashOffset);

        if (isNaN(circumference) || isNaN(offset)) {
            return null;
        }

        const progressLength = circumference - Math.abs(offset);
        const percent = (progressLength / circumference) * 100;

        return Math.max(0, Math.min(100, percent));
    } catch (error) {
        return null;
    }
}

function createProgressBar(questId: string, userId: string): HTMLElement {
    const key = getProgressBarKey(questId, userId);

    if (progressBars.has(key)) {
        return progressBars.get(key)!;
    }

    const color = settings.store.progressBarColor || "#5865F2";
    const progressBar = document.createElement("div");
    progressBar.id = `quest-progress-${key}`;
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 1%;
        height: 4px;
        background: linear-gradient(90deg, ${color}, ${adjustColorBrightness(color, 30)}, ${color});
        background-size: 200% 100%;
        z-index: 99999;
        transition: width 0.3s ease, opacity 0.4s ease, transform 0.4s ease;
        box-shadow: 0 0 15px ${color}99;
        animation: shimmer 2s infinite, progressBarSlideIn 0.4s ease-out;
        opacity: 1;
        transform: translateY(0);
    `;

    document.body.appendChild(progressBar);
    progressBars.set(key, progressBar);

    console.log("[QuestAutoComplete] Progress bar created:", key);

    return progressBar;
}

function adjustColorBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + percent);
    const g = Math.min(255, ((num >> 8) & 0xff) + percent);
    const b = Math.min(255, (num & 0xff) + percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function startProgressMonitoring(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);

    const discordPercent = getDiscordProgressPercent(questId);
    const questData = activeQuests.get(key);
    if (questData) {
        const initialProgress = discordPercent !== null ? discordPercent : 0;
        questData.lastProgress = initialProgress;
        updateProgressBar(questId, userId, initialProgress);
    }

    const monitorInterval = safeInterval(() => {
        if (isPluginStopping) return;

        const questData = activeQuests.get(key);
        if (!questData || !questData.isProcessing) {
            return;
        }

        const currentPercent = getDiscordProgressPercent(questId);
        if (currentPercent !== null) {
            if (currentPercent > questData.lastProgress) {
                questData.lastProgress = currentPercent;
                updateProgressBar(questId, userId, currentPercent);
            }

            if (questData.lastProgress >= 99.5) {
                clearInterval(monitorInterval);
                setTimeout(() => {
                    const currentData = activeQuests.get(key);
                    if (currentData && currentData.lastProgress >= 99.5) {
                        notify("Quest Completed!", "Progress tracking finished", "success");
                        cleanupQuest(questId, userId);
                    }
                }, 2000);
            }
        }
    }, 500);

    const questData2 = activeQuests.get(key);
    if (questData2) {
        questData2.intervalIds.push(monitorInterval);
    }
}

function updateProgressBar(questId: string, userId: string, percent: number) {
    if (isPluginStopping) return;

    const key = getProgressBarKey(questId, userId);
    const progressBar = progressBars.get(key);

    if (!progressBar) return;

    const clampedPercent = Math.min(100, Math.max(0, percent));
    progressBar.style.width = `${clampedPercent}%`;

    const questData = activeQuests.get(key);
    if (questData) {
        questData.lastProgress = clampedPercent;
    }
}

function removeProgressBar(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const progressBar = progressBars.get(key);

    if (progressBar) {
        progressBar.style.opacity = "0";
        progressBar.style.transform = "translateY(-10px)";

        setTimeout(() => {
            progressBar.remove();
            progressBars.delete(key);
        }, 400);
    }
}

function injectStyles() {
    if (document.getElementById("quest-autocomplete-styles")) return;

    const style = document.createElement("style");
    style.id = "quest-autocomplete-styles";
    style.textContent = `
        @keyframes shimmer {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes progressBarSlideIn {
            from { 
                opacity: 0; 
                transform: translateY(-10px) scaleX(0.3);
            }
            to { 
                opacity: 1; 
                transform: translateY(0) scaleX(1);
            }
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes progressShrink {
            from { width: 100%; }
            to { width: 0%; }
        }
        
        .quest-notification-container {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            align-items: center;
        }
        
        .quest-notification {
            background: rgba(30, 33, 36, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 12px;
            padding: 16px 24px;
            min-width: 400px;
            max-width: 500px;
            box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.5),
                0 0 0 1px rgba(255, 255, 255, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            pointer-events: auto;
            animation: fadeIn 0.3s ease-out;
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-left: 4px solid #5865f2;
        }
        
        .quest-notification.success {
            border-left-color: #43b581;
        }
        
        .quest-notification.cancel {
            border-left-color: #f04747;
        }
        
        .quest-notification.error {
            border-left-color: #f04747;
            background: rgba(240, 71, 71, 0.15);
            border: 1px solid rgba(240, 71, 71, 0.3);
        }
        
        .quest-notification.info {
            border-left-color: #5865f2;
        }
        
        .quest-notification.hiding {
            animation: fadeOut 0.3s ease-out forwards;
        }
        
        .quest-notification-content {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        
        .quest-notification-icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
            font-weight: bold;
        }
        
        .quest-notification-icon.success {
            background: #43b581;
            color: white;
        }
        
        .quest-notification-icon.cancel {
            background: #f04747;
            color: white;
        }
        
        .quest-notification-icon.error {
            background: #f04747;
            color: white;
        }
        
        .quest-notification-icon.info {
            background: #5865f2;
            color: white;
        }
        
        .quest-notification-text {
            flex: 1;
        }
        
        .quest-notification-title {
            font-weight: 600;
            font-size: 15px;
            color: #ffffff;
            margin-bottom: 4px;
        }
        
        .quest-notification-body {
            font-size: 14px;
            color: #b9bbbe;
            line-height: 1.4;
        }
        
        .quest-notification.error .quest-notification-title,
        .quest-notification.error .quest-notification-body {
            color: #ffffff;
        }
        
        .quest-notification-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 4px;
            background: linear-gradient(90deg, #5865f2, #7289da);
            background-size: 200% 100%;
            animation: shimmer 2s infinite, progressShrink var(--duration) linear forwards;
        }
        
        .quest-notification.success .quest-notification-progress {
            background: linear-gradient(90deg, #43b581, #3ca374);
        }
        
        .quest-notification.cancel .quest-notification-progress {
            background: linear-gradient(90deg, #f04747, #d84040);
        }
        
        .quest-notification.error .quest-notification-progress {
            background: linear-gradient(90deg, #f04747, #d84040);
        }
    `;
    document.head.appendChild(style);
}

function removeStyles() {
    document.getElementById("quest-autocomplete-styles")?.remove();
    document.getElementById("quest-notification-container")?.remove();
}

let notificationContainer: HTMLElement | null = null;
let activeNotifications: Map<string, HTMLElement> = new Map();
let lastNotificationTime: Map<string, number> = new Map();
const NOTIFICATION_COOLDOWN = 2000;
const MAX_NOTIFICATIONS = 3;

function getNotificationContainer(): HTMLElement {
    if (!notificationContainer || !document.body.contains(notificationContainer)) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'quest-notification-container';
        notificationContainer.className = 'quest-notification-container';
        document.body.appendChild(notificationContainer);
    }
    return notificationContainer;
}

function notify(title: string, body: string, type: "success" | "info" | "error" | "cancel" = "info") {
    try {
        if (!settings.store.showNotifications) return;

        const messageKey = `${title}:${body}:${type}`;
        const now = Date.now();
        const lastTime = lastNotificationTime.get(messageKey) || 0;

        if (now - lastTime < NOTIFICATION_COOLDOWN) return;
        lastNotificationTime.set(messageKey, now);

        if (activeNotifications.size >= MAX_NOTIFICATIONS) {
            const firstKey = activeNotifications.keys().next().value;
            if (firstKey) {
                removeNotification(firstKey);
            }
        }

        const container = getNotificationContainer();
        const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const baseDuration = (settings.store.notificationDuration || 4) * 1000;
        const duration = type === "error" ? baseDuration + 1000 : baseDuration;

        const notification = document.createElement('div');
        notification.className = `quest-notification ${type}`;
        notification.id = notificationId;
        notification.style.setProperty('--duration', `${duration}ms`);

        const icons: Record<string, string> = {
            success: '✓',
            error: '✕',
            info: 'ℹ',
            cancel: '✕'
        };

        notification.innerHTML = `
            <div class="quest-notification-content">
                <div class="quest-notification-icon ${type}">${icons[type]}</div>
                <div class="quest-notification-text">
                    <div class="quest-notification-title">${title}</div>
                    <div class="quest-notification-body">${body}</div>
                </div>
            </div>
            <div class="quest-notification-progress"></div>
        `;

        container.appendChild(notification);
        activeNotifications.set(notificationId, notification);

        setTimeout(() => {
            removeNotification(notificationId);
        }, duration);

    } catch (error) {
        console.error("[QuestAutoComplete] Notification error:", error);
    }
}

function removeNotification(notificationId: string) {
    const notification = activeNotifications.get(notificationId);
    if (notification) {
        notification.classList.add('hiding');
        setTimeout(() => {
            notification.remove();
            activeNotifications.delete(notificationId);
        }, 300);
    }
}

async function checkForUpdates(): Promise<void> {
    try {
        console.log("[QuestAutoComplete] Checking for updates...");

        const lastDismissed = await DataStore.get("questautocomplete-dismissed-version");
        console.log(`[QuestAutoComplete] Last dismissed version: ${lastDismissed}`);


        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(UPDATE_CHECK_URL, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`[QuestAutoComplete] GitHub API returned status: ${response.status}`);
            return;
        }

        const data = await response.json();

        let latestVersion = data.tag_name || data.name || "";
        latestVersion = latestVersion.replace(/^v/i, '').trim();

        if (!latestVersion) {
            console.error("[QuestAutoComplete] No valid version found in GitHub response");
            return;
        }

        const comparison = compareVersions(latestVersion, PLUGIN_VERSION);

        if (comparison > 0) {
            const releaseNotes = data.body || "No release notes available.";
            showUpdateModal(latestVersion, releaseNotes);
        }

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error("[QuestAutoComplete] Update check timed out");
        } else {
            console.error("[QuestAutoComplete] Update check error:", error);
        }
    }
}

function compareVersions(v1: string, v2: string): number {
    const clean1 = v1.replace(/[^0-9.]/g, '');
    const clean2 = v2.replace(/[^0-9.]/g, '');

    const parts1 = clean1.split('.').map(n => parseInt(n) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n) || 0);

    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;

        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }

    return 0;
}



function showQuestConflictModal(runningQuestId: string, newQuestId: string): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const theme = getThemeVariables();
            const runningQuest = QuestsStore?.getQuest(runningQuestId);
            const newQuest = QuestsStore?.getQuest(newQuestId);

            if (!runningQuest || !newQuest) {
                resolve(false);
                return;
            }

            const runningQuestName = runningQuest.config?.messages?.questName || "Unknown Quest";
            const newQuestName = newQuest.config?.messages?.questName || "Unknown Quest";

            const runningQuestTile = document.querySelector(`[id="quest-tile-${runningQuestId}"]`);
            const newQuestTile = document.querySelector(`[id="quest-tile-${newQuestId}"]`);

            if (!openModal) {
                const result = confirm(
                    `Quest Already Running\n\n` +
                    `"${runningQuestName}" is currently being automated.\n\n` +
                    `Do you want to cancel it and start "${newQuestName}" instead?\n\n` +
                    `Click OK to switch quests, or Cancel to keep the current one.`
                );
                resolve(result);
                return;
            }

            const backdrop = document.createElement("div");
            backdrop.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                z-index: 10000;
                animation: fadeIn 0.2s;
            `;

            const modalContent = document.createElement("div");
            modalContent.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: ${theme.background};
                border-radius: 8px;
                padding: 0;
                z-index: 10001;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                width: 520px;
                max-width: 95vw;
                max-height: 85vh;
                overflow-y: auto;
                font-family: var(--font-primary);
            `;

            const prepareQuestClone = (tile: Element | null, progressPercent?: number) => {
                if (!tile) return '<div style="padding: 16px; color: #b9bbbe; text-align: center;">Quest card not available</div>';

                const clone = tile.cloneNode(true) as HTMLElement;

                clone.querySelectorAll('button, [role="button"], [data-quest-autocomplete-btn]').forEach(el => el.remove());

                clone.style.pointerEvents = 'none';
                clone.style.transform = 'scale(0.85)';
                clone.style.transformOrigin = 'top left';
                clone.style.width = '117.6%'; // 100/0.85 to compensate for scale
                clone.style.marginBottom = '-15%'; // Reduce space from scaling

                clone.removeAttribute('id');

                return `<div style="overflow: hidden; border-radius: 8px;">${clone.outerHTML}</div>`;
            };

            const taskConfig = runningQuest.config?.taskConfig ?? runningQuest.config?.taskConfigV2;
            const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"]
                .find(x => taskConfig?.tasks?.[x] != null);
            const currentProgress = runningQuest.userStatus?.progress?.[taskName as string]?.value ?? 0;
            const targetProgress = taskConfig?.tasks?.[taskName as string]?.target ?? 0;
            const progressPercent = targetProgress > 0 ? Math.round((currentProgress / targetProgress) * 100) : 0;

            const runningQuestHTML = prepareQuestClone(runningQuestTile, progressPercent);
            const newQuestHTML = prepareQuestClone(newQuestTile);

            modalContent.innerHTML = `
                <div style="padding: 16px 16px 0 16px;">
                    <h2 style="color: ${theme.headerPrimary}; font-size: 18px; font-weight: 600; margin: 0 0 6px 0;">Quest Already Running</h2>
                    <p style="color: ${theme.textMuted}; font-size: 13px; margin: 0 0 16px 0;">Choose which quest to automate:</p>
                </div>

                <div style="padding: 0 16px 16px 16px;">
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="color: #43b581; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Currently Running</span>
                            ${progressPercent > 0 ? `<span style="background: #43b581; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">${progressPercent}%</span>` : ''}
                        </div>
                        <div style="border: 2px solid #43b581; border-radius: 10px; overflow: hidden; background: ${theme.backgroundSecondaryAlt};">
                            ${runningQuestHTML}
                        </div>
                    </div>

                    <div style="text-align: center; margin: 12px 0; color: ${theme.textMuted}; font-size: 18px;">↓</div>

                    <div style="margin-bottom: 12px;">
                        <div style="color: ${theme.textMuted}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Switch To</div>
                        <div style="border: 2px solid ${theme.textMuted}; border-radius: 10px; overflow: hidden; background: ${theme.backgroundSecondaryAlt};">
                            ${newQuestHTML}
                        </div>
                    </div>

                    <div style="padding: 8px 10px; background: rgba(250, 166, 26, 0.1); border-left: 3px solid #faa61a; border-radius: 4px; margin-top: 12px;">
                        <p style="font-size: 12px; color: ${theme.textNormal}; margin: 0;">⚠️ Only one quest can be automated at a time</p>
                    </div>
                </div>

                <div style="padding: 12px 16px; background: ${theme.backgroundSecondary}; border-radius: 0 0 8px 8px; display: flex; justify-content: flex-end; gap: 8px;">
                    <button id="quest-modal-cancel" style="padding: 8px 16px; border: none; border-radius: 4px; background: ${theme.backgroundSecondaryAlt}; color: ${theme.textNormal}; font-size: 13px; font-weight: 500; cursor: pointer;">Keep Current</button>
                    <button id="quest-modal-switch" style="padding: 8px 16px; border: none; border-radius: 4px; background: #5865f2; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer;">Switch Quest</button>
                </div>
            `;

            const cleanup = () => {
                try {
                    backdrop.remove();
                    modalContent.remove();
                } catch (e) { }
            };

            backdrop.onclick = (e) => {
                e.stopPropagation();
                cleanup();
                resolve(false);
            };

            modalContent.onclick = (e) => e.stopPropagation();

            document.body.appendChild(backdrop);
            document.body.appendChild(modalContent);

            setTimeout(() => {
                const cancelBtn = document.getElementById("quest-modal-cancel");
                const switchBtn = document.getElementById("quest-modal-switch");

                if (cancelBtn) {
                    cancelBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        cleanup();
                        resolve(false);
                    };
                }

                if (switchBtn) {
                    switchBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        cleanup();
                        resolve(true);
                    };
                }

                if (!cancelBtn || !switchBtn) {
                    cleanup();
                    resolve(false);
                }
            }, 10);

        } catch (error) {
            const result = confirm("A quest is already running. Switch to the new quest?");
            resolve(result);
        }
    });
}

async function completeVideoQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP"].find(x => taskConfig?.tasks?.[x] != null);

    if (!taskName) {
        notify("Error", "Invalid video quest configuration", "error");
        return false;
    }

    const secondsNeeded = taskConfig.tasks[taskName].target;
    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest duration", "error");
        return false;
    }

    const freshQuest = QuestsStore?.getQuest(quest.id);
    if (freshQuest?.userStatus?.completedAt) {
        notify("Already Completed", "This quest was already completed!", "info");
        return true;
    }

    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    const maxFuture = 10;
    const speed = 7;
    const interval = 1;
    const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
    let completed = false;
    const key = getProgressBarKey(quest.id, userId);

    notify("Quest Started", `Spoofing video for ${quest.config.messages.questName}`, "success");

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
        if (!webpackChunk) {
            notify("Error", "Webpack not available", "error");
            return false;
        }

        const wpRequire = webpackChunk.push([[Symbol()], {}, (req: any) => req]);
        webpackChunk.pop();

        const modules = Object.values(wpRequire.c) as any[];

        const apiModule = modules.find((x: any) => x?.exports?.Bo?.get)?.exports?.Bo
            || modules.find((x: any) => x?.exports?.tn?.get)?.exports?.tn
            || modules.find((x: any) => x?.exports?.HTTP?.get)?.exports?.HTTP;

        if (!apiModule) {
            console.log("[QuestAutoComplete] API module not found, falling back to fetch");
            return await completeVideoQuestFallback(quest, userId, secondsNeeded, secondsDone, enrolledAt, taskName, key);
        }

        console.log("[QuestAutoComplete] Using Discord's internal API module");

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
                    const res = await apiModule.post({
                        url: `/quests/${quest.id}/video-progress`,
                        body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) }
                    });
                    completed = res.body?.completed_at != null;
                    secondsDone = Math.min(secondsNeeded, timestamp);

                    const percent = Math.min(100, (secondsDone / secondsNeeded) * 100);
                    updateProgressBar(quest.id, userId, percent);
                    console.log(`[QuestAutoComplete] Video progress: ${secondsDone}/${secondsNeeded}`);
                } catch (e) {
                    console.warn("[QuestAutoComplete] Video progress error:", e);
                }
            }

            if (timestamp >= secondsNeeded) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, interval * 1000));
        }

        if (!completed) {
            try {
                await apiModule.post({
                    url: `/quests/${quest.id}/video-progress`,
                    body: { timestamp: secondsNeeded }
                });
            } catch (e) {
                console.warn("[QuestAutoComplete] Final video progress error:", e);
            }
        }

        updateProgressBar(quest.id, userId, 100);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const verifiedQuest = QuestsStore?.getQuest(quest.id);
        if (completed || verifiedQuest?.userStatus?.completedAt) {
            notify("Quest Completed!", quest.config.messages.questName, "success");
            cleanupQuest(quest.id, userId);
            return true;
        } else {
            notify("Quest Progress Saved", "Progress was saved. Try clicking Auto Complete again to finish.", "info");
            cleanupQuest(quest.id, userId);
            return false;
        }
    } catch (error: any) {
        console.error("[QuestAutoComplete] Video quest error:", error);
        notify("Quest Error", "An error occurred. Your progress was likely saved - try again.", "error");
        cleanupQuest(quest.id, userId);
        return false;
    }
}

async function completeVideoQuestFallback(
    quest: Quest,
    userId: string,
    secondsNeeded: number,
    secondsDone: number,
    enrolledAt: number,
    taskName: string,
    key: string
): Promise<boolean> {
    const maxFuture = 10;
    const speed = 7;
    const interval = 1;
    let completed = false;

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
                const res = await discordApiPost(`/quests/${quest.id}/video-progress`, {
                    timestamp: Math.min(secondsNeeded, timestamp + Math.random())
                });
                completed = res?.completed_at != null;
                secondsDone = Math.min(secondsNeeded, timestamp);

                const percent = Math.min(100, (secondsDone / secondsNeeded) * 100);
                updateProgressBar(quest.id, userId, percent);
                console.log(`[QuestAutoComplete] Video progress: ${secondsDone}/${secondsNeeded}`);
            } catch (e) {
                console.warn("[QuestAutoComplete] Video progress error:", e);
            }
        }

        if (timestamp >= secondsNeeded) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }

    if (!completed) {
        try {
            await discordApiPost(`/quests/${quest.id}/video-progress`, {
                timestamp: secondsNeeded
            });
        } catch (e) {
            console.warn("[QuestAutoComplete] Final video progress error:", e);
        }
    }

    updateProgressBar(quest.id, userId, 100);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const verifiedQuest = QuestsStore?.getQuest(quest.id);
    if (completed || verifiedQuest?.userStatus?.completedAt) {
        notify("Quest Completed!", quest.config.messages.questName, "success");
        cleanupQuest(quest.id, userId);
        return true;
    } else {
        notify("Quest Progress Saved", "Progress was saved. Try clicking Auto Complete again to finish.", "info");
        cleanupQuest(quest.id, userId);
        return false;
    }
}

async function completePlayQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig?.tasks?.PLAY_ON_DESKTOP?.target;

    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error");
        return false;
    }

    const applicationId = quest.config.application.id;
    const applicationName = quest.config.application.name;
    const currentProgress = quest.userStatus?.progress?.PLAY_ON_DESKTOP?.value ?? 0;

    notify("Quest Started", `Auto-completing: ${applicationName}. Wait ~${Math.ceil((secondsNeeded - currentProgress) / 60)} minutes.`, "success");

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

    return new Promise<boolean>((resolve) => {
        try {
            // Get webpack modules - same approach as reference code
            const webpackChunk = (window as any).webpackChunkdiscord_app;
            if (!webpackChunk) {
                notify("Error", "Webpack not available", "error");
                resolve(false);
                return;
            }

            const wpRequire = webpackChunk.push([[Symbol()], {}, (req: any) => req]);
            webpackChunk.pop();

            const modules = Object.values(wpRequire.c) as any[];

            const RunningGameStoreLocal = modules.find((x: any) => x?.exports?.Ay?.getRunningGames)?.exports?.Ay
                || modules.find((x: any) => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;

            const FluxDispatcherLocal = modules.find((x: any) => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h
                || modules.find((x: any) => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;

            if (!RunningGameStoreLocal) {
                notify("Error", "RunningGameStore not found", "error");
                resolve(false);
                return;
            }

            if (!FluxDispatcherLocal) {
                notify("Error", "FluxDispatcher not found", "error");
                resolve(false);
                return;
            }

            discordApiGet(`/applications/public?application_ids=${applicationId}`).then(async (appDataResponse) => {
                const appData = appDataResponse[0];
                const exeName = appData?.executables?.find((x: any) => x.os === "win32")?.name?.replace(">", "")
                    || `${applicationName.toLowerCase().replace(/\s+/g, '')}.exe`;

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

                const realGames = RunningGameStoreLocal.getRunningGames();
                const fakeGames = [fakeGame];

                const realGetRunningGames = RunningGameStoreLocal.getRunningGames;
                const realGetGameForPID = RunningGameStoreLocal.getGameForPID;

                RunningGameStoreLocal.getRunningGames = () => fakeGames;
                RunningGameStoreLocal.getGameForPID = (checkPid: number) => fakeGames.find((x: any) => x.pid === checkPid);

                FluxDispatcherLocal.dispatch({
                    type: "RUNNING_GAMES_CHANGE",
                    removed: realGames,
                    added: [fakeGame],
                    games: fakeGames
                });

                console.log(`[QuestAutoComplete] Spoofed game: ${applicationName} (pid: ${pid})`);
                console.log(`[QuestAutoComplete] Wait for ${Math.ceil((secondsNeeded - currentProgress) / 60)} more minutes.`);

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

                        const progress = quest.config.configVersion === 1
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

                            notify("Quest Completed!", quest.config.messages.questName, "success");
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

            }).catch((error) => {
                console.error("[QuestAutoComplete] Failed to get application data:", error);
                notify("Quest Error", `Failed to get app data: ${error?.message || 'Unknown error'}`, "error");
                removeProgressBar(quest.id, userId);
                cleanupQuest(quest.id, userId);
                resolve(false);
            });

        } catch (error: any) {
            console.error("[QuestAutoComplete] Failed to complete play quest:", error);
            notify("Quest Error", `Failed: ${error?.message || 'Unknown error'}`, "error");
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            resolve(false);
        }
    });
}

async function completeStreamQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig?.tasks?.STREAM_ON_DESKTOP?.target;

    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error");
        return false;
    }

    const applicationId = quest.config.application.id;
    const applicationName = quest.config.application.name;
    const currentProgress = quest.userStatus?.progress?.STREAM_ON_DESKTOP?.value ??
        quest.userStatus?.streamProgressSeconds ?? 0;

    notify("Quest Started", `Spoofed stream to ${applicationName}. Stream any window in VC for ${Math.ceil((secondsNeeded - currentProgress) / 60)} more minutes.`, "success");

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

    return new Promise<boolean>((resolve) => {
        try {
            const webpackChunk = (window as any).webpackChunkdiscord_app;
            if (!webpackChunk) {
                notify("Error", "Webpack not available", "error");
                resolve(false);
                return;
            }

            const wpRequire = webpackChunk.push([[Symbol()], {}, (req: any) => req]);
            webpackChunk.pop();

            const modules = Object.values(wpRequire.c) as any[];

            const AppStreamingStoreLocal = modules.find((x: any) => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.A
                || modules.find((x: any) => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z;

            const FluxDispatcherLocal = modules.find((x: any) => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h
                || modules.find((x: any) => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;

            if (!AppStreamingStoreLocal) {
                notify("Error", "ApplicationStreamingStore not found", "error");
                resolve(false);
                return;
            }

            if (!FluxDispatcherLocal) {
                notify("Error", "FluxDispatcher not found", "error");
                resolve(false);
                return;
            }

            const realFunc = AppStreamingStoreLocal.getStreamerActiveStreamMetadata;

            AppStreamingStoreLocal.getStreamerActiveStreamMetadata = () => ({
                id: applicationId,
                pid,
                sourceName: null
            });

            console.log(`[QuestAutoComplete] Spoofed stream to ${applicationName}. Stream any window in VC for ${Math.ceil((secondsNeeded - currentProgress) / 60)} more minutes.`);
            console.log(`[QuestAutoComplete] Remember that you need at least 1 other person to be in the VC!`);

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

                    const progress = quest.config.configVersion === 1
                        ? data.userStatus.streamProgressSeconds
                        : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);

                    const percent = Math.min(100, (progress / secondsNeeded) * 100);
                    updateProgressBar(quest.id, userId, percent);
                    console.log(`[QuestAutoComplete] Quest progress: ${progress}/${secondsNeeded}`);

                    if (progress >= secondsNeeded) {
                        console.log("[QuestAutoComplete] Quest completed!");

                        AppStreamingStoreLocal.getStreamerActiveStreamMetadata = realFunc;
                        FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);

                        notify("Quest Completed!", quest.config.messages.questName, "success");
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
            notify("Quest Error", `Failed: ${error?.message || 'Unknown error'}`, "error");
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            resolve(false);
        }
    });
}



async function completeActivityQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig?.tasks?.PLAY_ACTIVITY?.target;

    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error");
        return false;
    }

    notify("Quest Started", `Completing: ${quest.config.messages.questName}`, "success");

    if (settings.store.showProgressBar) {
        const bar = createProgressBar(quest.id, userId);
        setTimeout(() => {
            const initialPercent = getDiscordProgressPercent(quest.id);
            if (initialPercent !== null) {
                updateProgressBar(quest.id, userId, initialPercent);
            }
        }, 100);
    }

    try {
        const privateChannels = ChannelStore.getSortedPrivateChannels();
        const channelId = privateChannels?.[0]?.id ??
            Object.values(GuildChannelStore.getAllGuilds() ?? {})
                .find((x: any) => x != null && x.VOCAL?.length > 0)?.VOCAL?.[0]?.channel?.id;

        if (!channelId) {
            notify("Quest Error", "No voice channel found", "error");
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            return false;
        }

        const streamKey = `call:${channelId}:1`;
        const key = getProgressBarKey(quest.id, userId);

        let baseInterval = 0.8;
        const minInterval = 0.8;
        const maxInterval = 1.5;

        let retryCount = 0;
        const maxRetries = 8;

        while (true) {
            const questData = activeQuests.get(key);

            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }

            try {
                const res = await discordApiPost(`/quests/${quest.id}/heartbeat`, {
                    stream_key: streamKey,
                    terminal: false
                });

                const progress = res?.progress?.PLAY_ACTIVITY?.value ?? 0;
                retryCount = 0;

                if (progress >= secondsNeeded) {
                    await discordApiPost(`/quests/${quest.id}/heartbeat`, {
                        stream_key: streamKey,
                        terminal: true
                    });
                    break;
                }
            } catch (error: any) {
                const status = error?.status || error?.response?.status;

                if (status === 429 || (error?.message && error.message.includes('rate limit'))) {
                    retryCount++;
                    baseInterval = Math.min(baseInterval * 1.5, 3);

                    if (retryCount > maxRetries) {
                        notify("Quest Error", "Too many rate limits", "error");
                        removeProgressBar(quest.id, userId);
                        cleanupQuest(quest.id, userId);
                        return false;
                    }

                    const waitTime = Math.min(2000 * retryCount, 15000);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                } else {
                    notify("Quest Error", "Failed to complete activity", "error");
                    removeProgressBar(quest.id, userId);
                    cleanupQuest(quest.id, userId);
                    return false;
                }
            }

            const dynamicInterval = baseInterval + (Math.random() * (maxInterval - minInterval));
            await new Promise(resolve => safeTimeout(resolve as () => void, dynamicInterval * 1000, quest.id, userId));
        }

        updateProgressBar(quest.id, userId, 100);

        await new Promise(resolve => setTimeout(resolve, 2000));

        notify("Quest Completed!", quest.config.messages.questName, "success");
        cleanupQuest(quest.id, userId);
        return true;
    } catch (error) {
        notify("Quest Error", "Failed to complete activity", "error");
        removeProgressBar(quest.id, userId);
        cleanupQuest(quest.id, userId);
        return false;
    }
}

function cleanupQuest(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);

    clearQuestTimers(questId, userId);

    const cleanups = cleanupFunctions.get(key);
    if (cleanups) {
        cleanups.forEach(fn => {
            try {
                fn();
            } catch (error) { }
        });
        cleanupFunctions.delete(key);
    }

    activeQuests.delete(key);
    removeProgressBar(questId, userId);

    setTimeout(() => {
        if (refreshQuestButtonsRef) {
            refreshQuestButtonsRef();
        }
    }, 100);
}

function cancelQuest(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);

    if (questData) {
        questData.isProcessing = false;
        notify("Quest Cancelled", "Quest automation stopped", "cancel");
        cleanupQuest(questId, userId);
    }
}

function getRunningQuestId(): string | null {
    for (const [_, data] of activeQuests.entries()) {
        if (data.isProcessing) {
            return data.questId;
        }
    }
    return null;
}

async function startQuest(questId: string) {
    if (!QuestsStore || !api) {
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

    const runningQuestId = getRunningQuestId();
    if (runningQuestId && runningQuestId !== questId) {
        const shouldSwitch = await showQuestConflictModal(runningQuestId, questId);

        if (shouldSwitch) {
            const runningUserId = UserStore.getCurrentUser()?.id;
            if (runningUserId) {
                cancelQuest(runningQuestId, runningUserId);
            }
        } else {
            return;
        }
    }

    try {
        const quest = QuestsStore.getQuest(questId);

        if (!quest) {
            notify("Error", "Quest not found", "error");
            return;
        }

        if (quest.userStatus?.completedAt) {
            notify("Already Completed", "This quest is already completed", "info");
            return;
        }

        if (!quest.userStatus?.enrolledAt) {
            notify("Not Enrolled", "You need to accept this quest first", "error");
            return;
        }

        if (new Date(quest.config.expiresAt).getTime() <= Date.now()) {
            notify("Quest Expired", "This quest has expired", "error");
            return;
        }

        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"]
            .find(x => taskConfig?.tasks?.[x] != null);

        if (!taskName) {
            notify("Unknown Quest Type", "This quest type is not supported yet", "error");
            return;
        }

        const targetProgress = taskConfig.tasks[taskName]?.target || 0;

        activeQuests.set(key, {
            questId,
            userId,
            isProcessing: true,
            timeoutIds: [],
            intervalIds: [],
            lastProgress: 0,
            targetProgress
        });

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
                    notify("Desktop Required", "This quest requires Discord desktop app", "error");
                    cleanupQuest(questId, userId);
                }
                break;
            case "STREAM_ON_DESKTOP":
                if (isDesktopApp) {
                    await completeStreamQuest(quest, userId);
                } else {
                    notify("Desktop Required", "This quest requires Discord desktop app", "error");
                    cleanupQuest(questId, userId);
                }
                break;
            case "PLAY_ACTIVITY":
                await completeActivityQuest(quest, userId);
                break;
        }
    } catch (error) {
        notify("Quest Error", "An unexpected error occurred", "error");
        cleanupQuest(questId, userId);
    }
}

function QuestButton({ questId }: { questId: string }) {
    const [isRunning, setIsRunning] = React.useState(false);

    React.useEffect(() => {
        const userId = UserStore.getCurrentUser()?.id;
        if (!userId) return;

        const key = getProgressBarKey(questId, userId);
        const questData = activeQuests.get(key);
        setIsRunning(questData?.isProcessing ?? false);

        const interval = setInterval(() => {
            const questData = activeQuests.get(key);
            setIsRunning(questData?.isProcessing ?? false);
        }, 500);

        return () => clearInterval(interval);
    }, [questId]);

    return React.createElement(Button, {
        color: isRunning ? Button.Colors.RED : Button.Colors.BRAND,
        size: Button.Sizes.MEDIUM,
        fullWidth: true,
        onClick: () => startQuest(questId)
    }, isRunning ? "Cancel Automation" : "Auto Complete");
}

function findAndUpdateButtonText(element: HTMLElement, newText: string): boolean {
    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
            child.textContent = newText;
            return true;
        }
    }
    for (const child of Array.from(element.children)) {
        if (findAndUpdateButtonText(child as HTMLElement, newText)) {
            return true;
        }
    }
    return false;
}

function refreshQuestButtons() {
    document.querySelectorAll('[data-quest-autocomplete-btn]').forEach(el => el.remove());
    if (!isPluginStopping) {
        injectQuestButtons();
    }
}
refreshQuestButtonsRef = refreshQuestButtons;

function injectQuestButtons() {
    if (isPluginStopping) return;

    try {
        const questTiles = document.querySelectorAll('[id^="quest-tile-"]');

        questTiles.forEach((tile) => {
            const questId = (tile.id || "").replace("quest-tile-", "");
            if (!questId || !/^\d+$/.test(questId)) return;

            const existingBtn = tile.querySelector('[data-quest-autocomplete-btn]') as HTMLElement;

            const quest = QuestsStore?.getQuest(questId);
            if (!quest) {
                existingBtn?.remove();
                return;
            }

            if (quest.userStatus?.completedAt || new Date(quest.config.expiresAt).getTime() <= Date.now()) {
                existingBtn?.remove();
                return;
            }

            if (!quest.userStatus?.enrolledAt) {
                existingBtn?.remove();
                return;
            }

            const userId = UserStore.getCurrentUser()?.id;
            const key = userId ? getProgressBarKey(questId, userId) : null;
            const questData = key ? activeQuests.get(key) : null;
            const isRunning = questData?.isProcessing ?? false;

            if (existingBtn) {
                const currentState = existingBtn.getAttribute('data-running') === 'true';
                if (currentState === isRunning) return;
                existingBtn.remove();
            }

            let container: HTMLElement | null = null;
            const existingButtons = tile.querySelectorAll('button[type="button"]');
            if (existingButtons.length === 0) return;

            const lastBtn = existingButtons[existingButtons.length - 1];
            container = lastBtn.parentElement as HTMLElement;

            if (!container) return;

            const lastDiscordButton = existingButtons[existingButtons.length - 1] as HTMLButtonElement;
            const buttonParent = lastDiscordButton.parentElement;
            if (!buttonParent) return;

            const parentStyle = window.getComputedStyle(buttonParent);
            if (parentStyle.display !== 'flex' && parentStyle.display !== 'inline-flex') {
                buttonParent.style.display = 'flex';
                buttonParent.style.gap = '8px';
                buttonParent.style.flexWrap = 'wrap';
            }

            buttonParent.style.display = 'flex';
            buttonParent.style.flexWrap = 'nowrap';
            buttonParent.style.gap = '8px';
            buttonParent.style.alignItems = 'stretch';

            const allButtons = buttonParent.querySelectorAll('button');

            allButtons.forEach((btn: Element) => {
                const htmlBtn = btn as HTMLElement;
                if (!htmlBtn.hasAttribute('data-quest-autocomplete-btn')) {
                    htmlBtn.style.flex = '1 1 0';
                    htmlBtn.style.minWidth = '0';
                    htmlBtn.style.maxWidth = 'none';
                    htmlBtn.style.overflow = 'hidden';

                    const spans = htmlBtn.querySelectorAll('span, div');
                    spans.forEach((span: Element) => {
                        const htmlSpan = span as HTMLElement;
                        htmlSpan.style.overflow = 'hidden';
                        htmlSpan.style.textOverflow = 'ellipsis';
                        htmlSpan.style.whiteSpace = 'nowrap';
                    });
                }
            });

            const discordBtnComputedStyle = window.getComputedStyle(lastDiscordButton);

            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-quest-autocomplete-btn', 'true');
            button.setAttribute('data-quest-id', questId);
            button.setAttribute('data-running', isRunning.toString());

            button.style.cssText = `
                position: relative;
                display: flex;
                justify-content: center;
                align-items: center;
                box-sizing: border-box;
                border: none;
                border-radius: 3px;
                font-size: 14px;
                font-weight: 500;
                line-height: 16px;
                padding: 2px 8px;
                user-select: none;
                min-width: 0;
                min-height: ${discordBtnComputedStyle.minHeight || '38px'};
                height: ${discordBtnComputedStyle.height || '38px'};
                flex: 1 1 0;
                cursor: pointer;
                overflow: hidden;
                color: #fff;
                background-color: ${isRunning ? 'var(--button-danger-background, #da373c)' : 'var(--brand-500, #5865f2)'};
            `;

            const textSpan = document.createElement('span');
            textSpan.style.cssText = `
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 100%;
            `;
            textSpan.textContent = isRunning ? 'Cancel' : 'Auto Complete';
            button.appendChild(textSpan);

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startQuest(questId);
                setTimeout(() => refreshQuestButtonsRef?.(), 150);
            });

            lastDiscordButton.insertAdjacentElement('afterend', button);
        });
    } catch (error) {
        console.error("[QuestAutoComplete] Error injecting buttons:", error);
    }
}

function setupQuestButtonObserver() {
    if (questButtonsObserver) {
        questButtonsObserver.disconnect();
    }

    try {
        let debounceTimeout: number | null = null;

        questButtonsObserver = new MutationObserver((mutations) => {
            if (isPluginStopping) return;

            const isRelevant = mutations.some(mutation => {
                const target = mutation.target as HTMLElement;

                if (target?.hasAttribute?.('data-quest-autocomplete-btn') ||
                    target?.closest?.('[data-quest-autocomplete-btn]')) {
                    return false;
                }

                if (target?.closest?.('[id^="quest-tile-"]')) {
                    return mutation.type === 'childList';
                }

                if (mutation.type === 'childList') {
                    return Array.from(mutation.addedNodes).some(node =>
                        node instanceof HTMLElement &&
                        (node.id?.startsWith('quest-tile-') ||
                            node.querySelector?.('[id^="quest-tile-"]'))
                    );
                }

                return false;
            });

            if (isRelevant) {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = window.setTimeout(() => {
                    injectQuestButtons();
                    debounceTimeout = null;
                }, 200);
            }
        });

        questButtonsObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        injectQuestButtons();
        setTimeout(injectQuestButtons, 500);
        setTimeout(injectQuestButtons, 1500);
        setTimeout(injectQuestButtons, 3000);

    } catch (error) {
        console.error("[QuestAutoComplete] Error setting up observer:", error);
    }
}

function cleanupAll() {
    console.log("[QuestAutoComplete] Running full cleanup...");

    isPluginStopping = true;

    const questEntries = Array.from(activeQuests.entries());
    questEntries.forEach(([key, _]) => {
        const parsed = parseProgressBarKey(key);
        if (parsed) {
            try {
                cancelQuest(parsed.questId, parsed.userId);
            } catch (error) { }
        }
    });

    activeQuests.clear();

    progressBars.forEach(bar => {
        try {
            bar.remove();
        } catch (error) { }
    });
    progressBars.clear();

    cleanupFunctions.forEach(cleanups => {
        cleanups.forEach(fn => {
            try {
                fn();
            } catch (error) { }
        });
    });
    cleanupFunctions.clear();

    if (questButtonsObserver) {
        try {
            questButtonsObserver.disconnect();
            questButtonsObserver = null;
        } catch (error) { }
    }


    try {
        document.querySelectorAll('[data-quest-autocomplete-btn]').forEach(btn => {
            try {
                btn.remove();
            } catch (error) { }
        });
    } catch (error) { }

    removeStyles();

    try {
        document.querySelectorAll('[id^="quest-progress-"]').forEach(el => el.remove());
    } catch (error) { }

    console.log("[QuestAutoComplete] Cleanup completed");
}

export default definePlugin({
    name: "QuestAutoComplete",
    description: "Complete Discord quests with smart automation and real-time progress tracking",
    authors: [
        {
            id: 1172069050424250432n,
            name: "BlockTol",
        }
    ],
    tags: ["Quest", "Automation", "Rewards"],

    settings,

    settingsAboutComponent: () => {
        const { QuestSettings } = require("./Settings");
        return <QuestSettings />;
    },

    start() {
        console.log(`[QuestAutoComplete] Plugin started - v${PLUGIN_VERSION}`);

        isPluginStopping = false;

        injectStyles();
        setupTokenInterceptor();

        // Legacy/Helper functions preserved for reference
        function spoofRunningGame(applicationId: string, applicationName: string, pid: number): () => void {
            const fakeGame = {
                id: applicationId,
                name: applicationName,
                pid: pid,
                exeName: `${applicationName.toLowerCase().replace(/\s+/g, '')}.exe`,
                isLauncher: false,
                start: Date.now()
            };

            try {
                const webpackChunk = (window as any).webpackChunkdiscord_app;
                if (webpackChunk) {
                    const wpRequire = webpackChunk.push([
                        [Symbol()],
                        {},
                        (req: any) => req
                    ]);
                    webpackChunk.pop();

                    if (wpRequire?.c) {
                        let FluxDispatcher: any = null;
                        for (const mod of Object.values(wpRequire.c) as any[]) {
                            const exports = mod?.exports;
                            if (!exports) continue;
                            const candidates = [exports, exports.default, exports.Z, exports.ZP];
                            for (const candidate of candidates) {
                                if (candidate?.dispatch && candidate?._dispatch && candidate?.subscribe) {
                                    FluxDispatcher = candidate;
                                    break;
                                }
                            }
                            if (FluxDispatcher) break;
                        }

                        if (FluxDispatcher) {
                            FluxDispatcher.dispatch({
                                type: "RUNNING_GAMES_CHANGE",
                                added: [fakeGame],
                                removed: [],
                                games: [fakeGame]
                            });
                            console.log(`[QuestAutoComplete] Spoofed game: ${applicationName} (pid: ${pid})`);

                            return () => {
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "RUNNING_GAMES_CHANGE",
                                        added: [],
                                        removed: [fakeGame],
                                        games: []
                                    });
                                    console.log(`[QuestAutoComplete] Removed spoofed game: ${applicationName}`);
                                } catch (e) { }
                            };
                        }
                    }
                }
            } catch (e) {
                console.warn("[QuestAutoComplete] Failed to spoof running game:", e);
            }

            return () => { };
        }

        function spoofActiveStream(applicationId: string, channelId: string, guildId: string, pid: number): () => void {
            try {
                const webpackChunk = (window as any).webpackChunkdiscord_app;
                if (webpackChunk) {
                    const wpRequire = webpackChunk.push([
                        [Symbol()],
                        {},
                        (req: any) => req
                    ]);
                    webpackChunk.pop();

                    if (wpRequire?.c) {
                        let FluxDispatcher: any = null;
                        for (const mod of Object.values(wpRequire.c) as any[]) {
                            const exports = mod?.exports;
                            if (!exports) continue;
                            const candidates = [exports, exports.default, exports.Z, exports.ZP];
                            for (const candidate of candidates) {
                                if (candidate?.dispatch && candidate?._dispatch && candidate?.subscribe) {
                                    FluxDispatcher = candidate;
                                    break;
                                }
                            }
                            if (FluxDispatcher) break;
                        }

                        if (FluxDispatcher) {
                            FluxDispatcher.dispatch({
                                type: "STREAM_CREATE",
                                streamKey: `stream:${applicationId}:${pid}`,
                                rtcServerId: guildId,
                                channelId: channelId,
                                pid: pid,
                                paused: false
                            });
                            console.log(`[QuestAutoComplete] Spoofed stream for app: ${applicationId}`);

                            return () => {
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "STREAM_DELETE",
                                        streamKey: `stream:${applicationId}:${pid}`
                                    });
                                    console.log(`[QuestAutoComplete] Removed spoofed stream`);
                                } catch (e) { }
                            };
                        }
                    }
                }
            } catch (e) {
                console.warn("[QuestAutoComplete] Failed to spoof stream:", e);
            }

            return () => { };
        }
        setTimeout(() => {
            if (initializeStores()) {
                setupQuestButtonObserver();
                console.log("[QuestAutoComplete] Ready!");

                setTimeout(() => {
                    checkForUpdates().catch(err => { });
                }, 5000);

                updateCheckInterval = setInterval(() => {
                    checkForUpdates().catch(err => { });
                }, 30 * 60 * 1000);
            } else {
                notify("Initialization Failed", "Could not initialize quest stores. Please reload Discord.", "error");
            }
        }, 2000);
    },

    stop() {
        console.log("[QuestAutoComplete] Plugin stopping...");
        if (updateCheckInterval) {
            clearInterval(updateCheckInterval);
            updateCheckInterval = null;
        }
        cleanupAll();
    }
});
