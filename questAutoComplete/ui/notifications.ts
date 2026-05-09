import { settings } from "../index";

const questPills = new Map<string, HTMLElement>();
let pillContainer: HTMLElement | null = null;

function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function getPillContainer(): HTMLElement {
    const existing = document.getElementById("vc-pill-container");
    if (existing) {
        pillContainer = existing;
        return existing;
    }
    if (!pillContainer || !document.body.contains(pillContainer)) {
        pillContainer = document.createElement("div");
        pillContainer.id = "vc-pill-container";
        pillContainer.className = "vc-pill-container";
        document.body.appendChild(pillContainer);
    }
    return pillContainer;
}

function closePillElement(el: HTMLElement, delay = 900) {
    if (el.classList.contains("hiding")) return;
    el.classList.add("hiding");
    setTimeout(() => el.remove(), delay);
}

export function createQuestPill(questId: string, title: string): void {
    removeQuestPill(questId);

    const container = getPillContainer();
    const row = document.createElement("div");
    row.className = "quest-pill-row";
    row.id = `quest-row-${questId}`;

    const pill = document.createElement("div");
    pill.className = "quest-pill";
    pill.id = `quest-pill-${questId}`;

    pill.innerHTML = `
        <div class="quest-pill-compact">
            <div class="quest-pill-spinner"></div>
            <span class="quest-pill-title">${escapeHtml(title)}</span>
            <span class="quest-pill-percent">0%</span>
        </div>
        <div class="quest-pill-expanded">
            <div class="quest-pill-expanded-inner">
                <div class="quest-pill-body">Initializing...</div>
                <div class="quest-pill-progress-bar">
                    <div class="quest-pill-progress-fill"></div>
                </div>
                <div class="quest-pill-actions">
                    <button class="quest-btn danger quest-cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    row.appendChild(pill);
    container.insertBefore(row, container.firstChild);
    questPills.set(questId, row);

    const cancelBtn = pill.querySelector(".quest-cancel-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            const { cancelQuest } = require("../quests/manager");
            const { UserStore } = require("@webpack/common");
            const userId = UserStore.getCurrentUser()?.id;
            if (userId) cancelQuest(questId, userId);
        });
    }
}

export function updateQuestPill(questId: string, body?: string, percent?: number): void {
    const row = questPills.get(questId);
    if (!row) return;
    const pill = row.querySelector(".quest-pill");
    if (!pill || pill.classList.contains("completed")) return;

    if (body !== undefined) {
        const bodyEl = pill.querySelector(".quest-pill-body");
        if (bodyEl) bodyEl.textContent = body;
    }

    if (percent !== undefined) {
        const safePercent = Math.min(100, Math.max(0, Math.round(percent)));
        const percentEl = pill.querySelector(".quest-pill-percent");
        if (percentEl) percentEl.textContent = `${safePercent}%`;

        const progressFill = pill.querySelector(".quest-pill-progress-fill") as HTMLElement;
        if (progressFill) progressFill.style.width = `${safePercent}%`;
    }
}

export function completeQuestPill(questId: string, message: string, success: boolean): void {
    const row = questPills.get(questId);
    if (!row) return;
    const pill = row.querySelector(".quest-pill");
    if (!pill) return;

    pill.classList.add("completed");
    pill.classList.add(success ? "success" : "error");

    const titleEl = pill.querySelector(".quest-pill-title");
    if (titleEl) titleEl.textContent = message;

    const percentEl = pill.querySelector(".quest-pill-percent");
    if (percentEl) percentEl.textContent = success ? "Done" : "Error";

    const progressFill = pill.querySelector(".quest-pill-progress-fill") as HTMLElement;
    if (progressFill) progressFill.style.width = "100%";

    const slides = row.querySelectorAll(".quest-pill-slide");
    slides.forEach(s => s.remove());

    const delay = success ? 5000 : 6000;
    setTimeout(() => {
        const currentRow = questPills.get(questId);
        if (!currentRow) return;
        const currentPill = currentRow.querySelector(".quest-pill");
        if (currentPill) {
            closePillElement(currentPill as HTMLElement);
            setTimeout(() => {
                currentRow.remove();
                questPills.delete(questId);
            }, 900);
        }
    }, delay);
}

export function removeQuestPill(questId: string): void {
    const row = questPills.get(questId);
    if (row) {
        row.remove();
        questPills.delete(questId);
    }
}

function showPillSlideMessage(questId: string, message: string, type: "success" | "info" | "error" | "cancel"): void {
    const row = questPills.get(questId);
    if (!row) {
        showSubPill("", message, type);
        return;
    }

    const existing = row.querySelector(".quest-pill-slide");
    if (existing) {
        closePillElement(existing as HTMLElement, 400);
    }

    const icons: Record<string, string> = { success: "✓", error: "✕", info: "⚡", cancel: "✕" };

    const slide = document.createElement("div");
    slide.className = "quest-pill-slide";

    slide.innerHTML = `
        <div class="quest-pill-slide-icon ${type}">${icons[type]}</div>
        <span class="quest-pill-slide-text">${escapeHtml(message)}</span>
    `;

    row.appendChild(slide);

    const duration = type === "error" ? 5000 : 3000;
    setTimeout(() => {
        if (slide.parentElement) {
            closePillElement(slide, 400);
        }
    }, duration);
}

function showSubPill(title: string, body: string, type: "success" | "info" | "error" | "cancel"): void {
    const container = getPillContainer();

    const existingPills = container.querySelectorAll(".quest-sub-pill:not(.hiding)");
    if (existingPills.length > 4) {
        const oldest = existingPills[0] as HTMLElement;
        closePillElement(oldest, 500);
    }

    const icons: Record<string, string> = { success: "✓", error: "✕", info: "⚡", cancel: "✕" };
    const duration = type === "error" ? 6000 : 3000;

    const pill = document.createElement("div");
    pill.className = `quest-sub-pill ${type}`;

    pill.innerHTML = `
        <div class="quest-sub-pill-icon ${type}">${icons[type]}</div>
        <div class="quest-sub-pill-content">
            ${title ? `<div class="quest-sub-pill-title">${escapeHtml(title)}</div>` : ""}
            ${body ? `<div class="quest-sub-pill-body">${escapeHtml(body)}</div>` : ""}
        </div>
    `;

    container.appendChild(pill);

    setTimeout(() => {
        closePillElement(pill, 500);
    }, duration);
}

export function notify(title: string, body: string, type: "success" | "info" | "error" | "cancel" = "info", questId?: string): void {
    try {
        if (!settings.store.showNotifications) return;

        if (questId && questPills.has(questId)) {
            showPillSlideMessage(questId, body, type);
        } else {
            showSubPill(title, body, type);
        }
    } catch (error) {
        console.error("[QuestAutoComplete] Notification error:", error);
    }
}

export function cleanupAllPills(): void {
    questPills.forEach((row) => {
        try { row.remove(); } catch (e) {}
    });
    questPills.clear();

    const container = document.getElementById("vc-pill-container");
    if (container) {
        container.querySelectorAll(".quest-pill-row, .quest-sub-pill").forEach(el => el.remove());
        if (container.children.length === 0) container.remove();
    }
    pillContainer = null;
}
