import { findByPropsLazy } from "@webpack";
import { QuestsStore } from "../core/stores";
import { getThemeVariables } from "../core/utils";
const openModal = findByPropsLazy("openModal", "closeModal")?.openModal;
export function showQuestConflictModal(runningQuestId: string, newQuestId: string): Promise<boolean> {
    return new Promise(resolve => {
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
            const prepareQuestClone = (tile: Element | null) => {
                if (!tile) return '<div style="padding: 16px; color: #b9bbbe; text-align: center;">Quest card not available</div>';
                const clone = tile.cloneNode(true) as HTMLElement;
                clone.querySelectorAll('button, [role="button"], [data-quest-autocomplete-btn]').forEach(el => el.remove());
                clone.style.pointerEvents = "none";
                clone.style.transform = "scale(0.85)";
                clone.style.transformOrigin = "top left";
                clone.style.width = "117.6%";
                clone.style.marginBottom = "-15%";
                clone.removeAttribute("id");
                return `<div style="overflow: hidden; border-radius: 8px;">${clone.outerHTML}</div>`;
            };
            const taskConfig = runningQuest.config?.taskConfig ?? runningQuest.config?.taskConfigV2;
            const taskName = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"]
                .find(x => taskConfig?.tasks?.[x] != null);
            const currentProgress = runningQuest.userStatus?.progress?.[taskName as string]?.value ?? 0;
            const targetProgress = taskConfig?.tasks?.[taskName as string]?.target ?? 0;
            const progressPercent = targetProgress > 0 ? Math.round((currentProgress / targetProgress) * 100) : 0;
            const runningQuestHTML = prepareQuestClone(runningQuestTile);
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
                            ${progressPercent > 0 ? `<span style="background: #43b581; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">${progressPercent}%</span>` : ""}
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
                        <p style="font-size: 12px; color: ${theme.textNormal}; margin: 0;">⚠️ Only one quest of the same type can be automated at a time</p>
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
            backdrop.onclick = e => {
                e.stopPropagation();
                cleanup();
                resolve(false);
            };
            modalContent.onclick = e => e.stopPropagation();
            document.body.appendChild(backdrop);
            document.body.appendChild(modalContent);
            setTimeout(() => {
                const cancelBtn = document.getElementById("quest-modal-cancel");
                const switchBtn = document.getElementById("quest-modal-switch");
                if (cancelBtn) {
                    cancelBtn.onclick = e => {
                        e.stopPropagation();
                        e.preventDefault();
                        cleanup();
                        resolve(false);
                    };
                }
                if (switchBtn) {
                    switchBtn.onclick = e => {
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
