import { settings } from "../index";
import { activeQuests, getProgressBarKey, isPluginStopping, progressBars } from "../core/state";
import { safeInterval } from "../core/utils";
import { updateQuestPill } from "./notifications";

export function getDiscordProgressPercent(questId: string): number | null {
    try {
        const questTile = document.querySelector(`[id="quest-tile-${questId}"]`);
        if (!questTile) return null;
        const allCircles = questTile.querySelectorAll("circle");
        let greenCircle: Element | null = null;
        allCircles.forEach(circle => {
            const stroke = circle.getAttribute("stroke");
            const style = circle.getAttribute("style");
            if (stroke && (stroke.includes("green") || stroke.includes("--green-330"))) {
                greenCircle = circle;
            } else if (style && style.includes("green")) {
                greenCircle = circle;
            }
        });
        if (!greenCircle && allCircles.length >= 2) {
            greenCircle = allCircles[1];
        }
        if (!greenCircle) return null;
        let dashArray = greenCircle.getAttribute("stroke-dasharray");
        let dashOffset = greenCircle.getAttribute("stroke-dashoffset");
        if (!dashArray || !dashOffset) {
            const style = window.getComputedStyle(greenCircle);
            dashArray = dashArray || style.strokeDasharray;
            dashOffset = dashOffset || style.strokeDashoffset;
        }
        if (!dashArray || !dashOffset || dashArray === "none" || dashOffset === "none") return null;
        const circumferenceMatch = dashArray.match(/[\d.]+/);
        if (!circumferenceMatch) return null;
        const circumference = parseFloat(circumferenceMatch[0]);
        const offset = parseFloat(dashOffset);
        if (isNaN(circumference) || isNaN(offset)) return null;
        const progressLength = circumference - Math.abs(offset);
        const percent = (progressLength / circumference) * 100;
        return Math.max(0, Math.min(100, percent));
    } catch (error) {
        return null;
    }
}

export function createProgressBar(questId: string, userId: string): HTMLElement {
    const key = getProgressBarKey(questId, userId);
    if (progressBars.has(key)) {
        return progressBars.get(key)!;
    }
    const placeholder = document.createElement("div");
    progressBars.set(key, placeholder);
    return placeholder;
}

export function updateProgressBar(questId: string, userId: string, percent: number) {
    if (isPluginStopping) return;
    const key = getProgressBarKey(questId, userId);
    const clampedPercent = Math.min(100, Math.max(0, percent));
    updateQuestPill(questId, undefined, clampedPercent);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.lastProgress = clampedPercent;
    }
}

export function removeProgressBar(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    progressBars.delete(key);
}

export function startProgressMonitoring(questId: string, userId: string) {
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
        if (!questData || !questData.isProcessing) return;
        const currentPercent = getDiscordProgressPercent(questId);
        if (currentPercent !== null) {
            if (currentPercent > questData.lastProgress) {
                questData.lastProgress = currentPercent;
                updateProgressBar(questId, userId, currentPercent);
            }
        }
    }, 500, questId, userId);
    const questData2 = activeQuests.get(key);
    if (questData2) {
        questData2.intervalIds.push(monitorInterval);
    }
}
