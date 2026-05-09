import { activeQuests, getProgressBarKey, isPluginStopping } from "./state";
export function safeTimeout(callback: () => void, delay: number, questId: string, userId: string): number {
    const timeoutId = window.setTimeout(callback, delay);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.push(timeoutId);
    }
    return timeoutId;
}
export function safeInterval(callback: () => void, interval: number, questId: string, userId: string): number {
    const intervalId = window.setInterval(callback, interval);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.intervalIds.push(intervalId);
    }
    return intervalId;
}
export function clearQuestTimers(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.forEach(id => clearTimeout(id));
        questData.intervalIds.forEach(id => clearInterval(id));
        questData.timeoutIds = [];
        questData.intervalIds = [];
    }
}
export function adjustColorBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + percent);
    const g = Math.min(255, ((num >> 8) & 0xff) + percent);
    const b = Math.min(255, (num & 0xff) + percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
export function compareVersions(v1: string, v2: string): number {
    const clean1 = v1.replace(/[^0-9.]/g, "");
    const clean2 = v2.replace(/[^0-9.]/g, "");
    const parts1 = clean1.split(".").map(n => parseInt(n) || 0);
    const parts2 = clean2.split(".").map(n => parseInt(n) || 0);
    const maxLength = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLength; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}
export function getThemeVariables() {
    const isDark = document.documentElement.classList.contains("theme-dark");
    return {
        isDark,
        background: isDark ? "#2f3136" : "#ffffff",
        backgroundSecondary: isDark ? "#292b2f" : "#f2f3f5",
        backgroundSecondaryAlt: isDark ? "#292b2f" : "#ebedef",
        backgroundTertiary: isDark ? "#202225" : "#e3e5e8",
        headerPrimary: isDark ? "#ffffff" : "#060607",
        textNormal: isDark ? "#dcddde" : "#2e3338",
        textMuted: isDark ? "#b9bbbe" : "#4e5058",
        brandColor: "#5865f2",
        dangerColor: "#ed4245",
        successColor: "#43b581",
    };
}
