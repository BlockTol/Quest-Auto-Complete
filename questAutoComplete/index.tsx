import "./styles.css";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";
import { DataStore } from "@api/index";
import { showUpdateModal } from "./components/UpdateModal";
import { compareVersions } from "./core/utils";
import { initializeStores } from "./core/stores";
import {
    activeQuests,
    cleanupFunctions,
    parseProgressBarKey,
    progressBars,
    setPluginStopping,
} from "./core/state";
import { cleanupAllPills } from "./ui/notifications";
import { notify } from "./ui/notifications";
import { setupQuestButtonObserver, cleanupQuestButtonObserver } from "./ui/questButtons";
import { cancelQuest, checkAndResumeQuests } from "./quests/manager";
export const PLUGIN_VERSION = "2.0.0";
export const GITHUB_REPO = "BlockTol/Quest-Auto-Complete";
export const UPDATE_CHECK_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const GITHUB_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Display toast notifications for quest events",
        default: true,
    },
    notificationDuration: {
        type: OptionType.SLIDER,
        description: "How long notifications stay on screen (seconds)",
        default: 4,
        markers: [2, 4, 6, 8, 10],
    },
    autoResumeAfterReload: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume quest automation after Discord reload",
        default: true,
    },
});
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
async function checkForUpdates(): Promise<void> {
    try {
        console.log("[QuestAutoComplete] Checking for updates...");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(UPDATE_CHECK_URL, {
            signal: controller.signal,
            headers: {
                Accept: "application/vnd.github.v3+json",
            },
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error(`[QuestAutoComplete] GitHub API returned status: ${response.status}`);
            return;
        }
        const data = await response.json();
        let latestVersion = data.tag_name || data.name || "";
        latestVersion = latestVersion.replace(/^v/i, "").trim();
        if (!latestVersion) {
            console.error("[QuestAutoComplete] No valid version found in GitHub response");
            return;
        }
        const comparison = compareVersions(latestVersion, PLUGIN_VERSION);
        if (comparison > 0) {
            const { DataStore } = require("@api/index");
            const dismissedVersion = DataStore.get('QuestAutoComplete-dismissed-version');
            if (dismissedVersion !== latestVersion) {
                const releaseNotes = data.body || "No release notes available.";
                showUpdateModal(latestVersion, releaseNotes);
            }
        }
    } catch (error: any) {
        if (error.name === "AbortError") {
            console.error("[QuestAutoComplete] Update check timed out");
        } else {
            console.error("[QuestAutoComplete] Update check error:", error);
        }
    }
}
function cleanupAll() {
    console.log("[QuestAutoComplete] Running full cleanup...");
    setPluginStopping(true);
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
        try { bar.remove(); } catch (error) { }
    });
    progressBars.clear();
    cleanupFunctions.forEach(cleanups => {
        cleanups.forEach(fn => {
            try { fn(); } catch (error) { }
        });
    });
    cleanupFunctions.clear();
    cleanupQuestButtonObserver();
    cleanupAllPills();
    console.log("[QuestAutoComplete] Cleanup completed");
}
export default definePlugin({
    name: "QuestAutoComplete",
    description: "Complete Discord quests with smart automation and real-time progress tracking",
    authors: [
        {
            id: 1449096170646536233n,
            name: "BlockTol",
        },
    ],
    tags: ["Activity", "Utility", "Fun"],
    settings,
    settingsAboutComponent: () => {
        const { QuestSettings } = require("./components/Settings");
        return <QuestSettings />;
    },
    start() {
        console.log(`[QuestAutoComplete] Plugin started - v${PLUGIN_VERSION}`);
        setPluginStopping(false);

        setTimeout(() => {
            if (initializeStores()) {
                setupQuestButtonObserver();
                console.log("[QuestAutoComplete] Ready!");
                setTimeout(() => {
                    checkAndResumeQuests().catch(err => {
                        console.warn("[QuestAutoComplete] Resume check failed:", err);
                    });
                }, 3000);
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
    },
});
