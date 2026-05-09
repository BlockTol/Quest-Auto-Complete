import { Button, React, UserStore } from "@webpack/common";
import { activeQuests, getProgressBarKey, isPluginStopping, refreshQuestButtonsRef, setRefreshQuestButtonsRef } from "../core/state";
import { QuestsStore } from "../core/stores";
import { ALL_TASK_TYPES } from "../core/types";
import { startQuest } from "../quests/manager";
let questButtonsObserver: MutationObserver | null = null;
let isInjecting = false;
const failedQuestIds = new Set<string>();
export function QuestButton({ questId }: { questId: string }) {
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
        style: { width: "100%" },
        onClick: () => startQuest(questId),
    }, isRunning ? "Cancel Automation" : "Auto Complete");
}
function safeGetQuest(questId: string): any {
    if (failedQuestIds.has(questId)) return null;
    if (!QuestsStore) return null;
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    let quest: any = null;
    try {
        quest = QuestsStore.getQuest(questId);
    } catch {
    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    }
    if (!quest) {
        failedQuestIds.add(questId);
    }
    return quest;
}
function injectQuestButtons() {
    if (isPluginStopping || isInjecting) return;
    isInjecting = true;
    if (questButtonsObserver) {
        questButtonsObserver.disconnect();
    }
    try {
        const questTiles = document.querySelectorAll('[id^="quest-tile-"]');
        if (questTiles.length === 0) return;
        questTiles.forEach(tile => {
            const questId = (tile.id || "").replace("quest-tile-", "");
            if (!questId || !/^\d+$/.test(questId)) return;
            const existingBtn = tile.querySelector("[data-quest-autocomplete-btn]") as HTMLElement;
            const quest = safeGetQuest(questId);
            if (quest?.userStatus?.completedAt) {
                existingBtn?.remove();
                return;
            }
            if (!quest?.userStatus?.enrolledAt) {
                existingBtn?.remove();
                return;
            }
            if (quest?.config?.expiresAt && new Date(quest.config.expiresAt).getTime() < Date.now()) {
                existingBtn?.remove();
                return;
            }
            const taskCfg = quest?.config?.taskConfigV2 ?? quest?.config?.taskConfig ?? quest?.taskConfigV2 ?? quest?.taskConfig;
            let isSupported = true;
            if (taskCfg && taskCfg.tasks) {
                if ("ACHIEVEMENT_IN_ACTIVITY" in taskCfg.tasks) {
                    isSupported = false;
                } else {
                    isSupported = ALL_TASK_TYPES.some(type => type in taskCfg.tasks);
                }
            }
            if (!isSupported) {
                existingBtn?.remove();
                return;
            }
            const userId = UserStore.getCurrentUser()?.id;
            const key = userId ? getProgressBarKey(questId, userId) : null;
            const questData = key ? activeQuests.get(key) : null;
            const isRunning = questData?.isProcessing ?? false;
            if (existingBtn) {
                const currentState = existingBtn.getAttribute("data-running") === "true";
                if (currentState === isRunning) return;
                existingBtn.remove();
            }
            const existingButtons = tile.querySelectorAll('button[type="button"]');
            if (existingButtons.length === 0) return;
            const lastDiscordButton = existingButtons[existingButtons.length - 1] as HTMLButtonElement;
            const buttonParent = lastDiscordButton.parentElement;
            if (!buttonParent) return;
            buttonParent.style.display = "flex";
            buttonParent.style.flexWrap = "nowrap";
            buttonParent.style.gap = "8px";
            buttonParent.style.alignItems = "stretch";
            const allButtons = buttonParent.querySelectorAll("button");
            allButtons.forEach((btn: Element) => {
                const htmlBtn = btn as HTMLElement;
                if (!htmlBtn.hasAttribute("data-quest-autocomplete-btn")) {
                    htmlBtn.style.flex = "1 1 0";
                    htmlBtn.style.minWidth = "0";
                    htmlBtn.style.maxWidth = "none";
                    htmlBtn.style.overflow = "hidden";
                    const spans = htmlBtn.querySelectorAll("span, div");
                    spans.forEach((span: Element) => {
                        const htmlSpan = span as HTMLElement;
                        htmlSpan.style.overflow = "hidden";
                        htmlSpan.style.textOverflow = "ellipsis";
                        htmlSpan.style.whiteSpace = "nowrap";
                    });
                }
            });
            const discordBtnComputedStyle = window.getComputedStyle(lastDiscordButton);
            const button = document.createElement("button");
            button.type = "button";
            button.setAttribute("data-quest-autocomplete-btn", "true");
            button.setAttribute("data-quest-id", questId);
            button.setAttribute("data-running", isRunning.toString());
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
                min-height: ${discordBtnComputedStyle.minHeight || "38px"};
                height: ${discordBtnComputedStyle.height || "38px"};
                flex: 1 1 0;
                cursor: pointer;
                overflow: hidden;
                color: #fff;
                background-color: ${isRunning ? "var(--button-danger-background, #da373c)" : "var(--brand-500, #5865f2)"};
            `;
            const textSpan = document.createElement("span");
            textSpan.style.cssText = `
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 100%;
            `;
            textSpan.textContent = isRunning ? "Cancel" : "Auto Complete";
            button.appendChild(textSpan);
            button.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                startQuest(questId);
                setTimeout(() => refreshQuestButtonsRef?.(), 150);
            });
            lastDiscordButton.insertAdjacentElement("afterend", button);
        });
    } catch (error) {
    } finally {
        isInjecting = false;
        if (questButtonsObserver && !isPluginStopping) {
            try {
                questButtonsObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
            } catch { }
        }
    }
}
function refreshQuestButtons() {
    failedQuestIds.clear();
    document.querySelectorAll("[data-quest-autocomplete-btn]").forEach(el => el.remove());
    if (!isPluginStopping) {
        injectQuestButtons();
    }
}
export function setupQuestButtonObserver() {
    if (questButtonsObserver) {
        questButtonsObserver.disconnect();
    }
    setRefreshQuestButtonsRef(refreshQuestButtons);
    try {
        let debounceTimeout: number | null = null;
        questButtonsObserver = new MutationObserver(mutations => {
            if (isPluginStopping || isInjecting) return;
            const isRelevant = mutations.some(mutation => {
                const target = mutation.target as HTMLElement;
                if (target?.hasAttribute?.("data-quest-autocomplete-btn") ||
                    target?.closest?.("[data-quest-autocomplete-btn]")) {
                    return false;
                }
                if (target?.closest?.('[id^="quest-tile-"]')) {
                    return mutation.type === "childList";
                }
                if (mutation.type === "childList") {
                    return Array.from(mutation.addedNodes).some(node =>
                        node instanceof HTMLElement &&
                        (node.id?.startsWith("quest-tile-") ||
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
                }, 800);
            }
        });
        questButtonsObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
        injectQuestButtons();
        setTimeout(injectQuestButtons, 2000);
        setTimeout(injectQuestButtons, 5000);
    } catch (error) {
        console.error("[QuestAutoComplete] Error setting up observer:", error);
    }
}
export function cleanupQuestButtonObserver() {
    if (questButtonsObserver) {
        try {
            questButtonsObserver.disconnect();
            questButtonsObserver = null;
        } catch (error) { }
    }
    failedQuestIds.clear();
    try {
        document.querySelectorAll("[data-quest-autocomplete-btn]").forEach(btn => {
            try { btn.remove(); } catch (error) { }
        });
    } catch (error) { }
}
