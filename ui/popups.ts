/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { i18n } from "@webpack/common";

import { debug } from "../core/logger";
import { settings } from "../core/settings";

const QR_QUEST_MESSAGES = ["zlG59w", "bBTjR9"];

const QR_GENERIC_MESSAGES = ["g3jrBu"];

const REVEAL_AFTER_MS = 400;

const WATCH_FOR_MS = 4000;

const GIVE_UP_CLOSING_MS = 1500;

type Verdict = "popup" | "quest" | "other";

let observer: MutationObserver | null = null;
const timers = new Set<ReturnType<typeof setTimeout>>();

const releases = new Set<() => void>();

function later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
    }, ms);
    timers.add(timer);
}

function localized(keys: string[]): string[] {
    const texts: string[] = [];

    for (const key of keys) {
        try {
            const text = i18n.intl.string(i18n.t[key]);
            if (typeof text === "string" && text.length > 8) texts.push(text);
        } catch { }
    }

    return texts;
}

const hasClass = (element: Node | null, part: string): element is HTMLElement =>
    element instanceof HTMLElement && typeof element.className === "string" && element.className.includes(part);

function reactFiberOf(element: Element): any {
    const key = Object.keys(element).find(k => k.startsWith("__reactFiber$"));
    return key ? (element as any)[key] : null;
}

function findInProps<T>(layer: Element, check: (props: any) => T | undefined): T | undefined {
    const elements = [layer, ...Array.from(layer.querySelectorAll("*")).slice(0, 40)];

    for (const element of elements) {
        let fiber = reactFiberOf(element);

        for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
            const found = fiber.memoizedProps && check(fiber.memoizedProps);
            if (found !== undefined) return found;
        }
    }
}

const hasQuestProp = (layer: Element) =>
    findInProps(layer, props => (props.initialQuest ?? props.quest)?.config?.messages ? true : undefined) === true;

const findClose = (layer: Element) =>
    findInProps<() => void>(layer, props => typeof props.onClose === "function" && "transitionState" in props ? props.onClose : undefined);

function isModalLayer(layer: HTMLElement): boolean {
    return hasClass(layer.previousElementSibling, "scrim") || layer.querySelector('[data-mana-component="modal"]') != null;
}

function classify(layer: HTMLElement): Verdict {
    const text = layer.textContent ?? "";

    if (localized(QR_QUEST_MESSAGES).some(message => text.includes(message))) return "popup";
    if (!hasQuestProp(layer)) return "other";

    if (layer.querySelector("video") || localized(QR_GENERIC_MESSAGES).some(message => text.includes(message))) return "popup";

    return "quest";
}

function watchLayer(layer: HTMLElement) {
    const previous = layer.previousElementSibling;
    const scrim = hasClass(previous, "scrim") ? previous : null;

    let hidden = false;
    let closing = false;
    let revealScheduled = false;

    const setHidden = (value: boolean) => {
        if (hidden === value) return;
        hidden = value;

        for (const element of [layer, scrim]) {
            if (!element) continue;

            if (value) element.style.setProperty("display", "none", "important");
            else element.style.removeProperty("display");
        }
    };

    const layerObserver = new MutationObserver(() => evaluate());

    const release = () => {
        layerObserver.disconnect();
        releases.delete(release);
        setHidden(false);
    };

    const evaluate = () => {
        if (closing) return;
        if (!layer.isConnected) return release();

        const verdict = classify(layer);
        debug("Quest popup watcher, new modal:", verdict, (layer.textContent ?? "").slice(0, 80));

        if (verdict === "popup") {
            const close = findClose(layer);
            if (!close) {
                debug("Quest popup watcher: this modal has no close handle, leaving it alone");
                return release();
            }

            closing = true;
            layerObserver.disconnect();
            setHidden(true);
            close();

            later(() => {
                if (layer.isConnected) release();
            }, GIVE_UP_CLOSING_MS);
        } else if (verdict === "quest") {
            setHidden(true);

            if (!revealScheduled) {
                revealScheduled = true;
                later(() => {
                    if (!closing) setHidden(false);
                }, REVEAL_AFTER_MS);
            }
        }
    };

    layerObserver.observe(layer, { childList: true, subtree: true });
    releases.add(release);
    later(() => {
        if (!closing) release();
    }, WATCH_FOR_MS);

    evaluate();
}

export function startPopupWatcher() {
    stopPopupWatcher();

    observer = new MutationObserver(mutations => {
        if (!settings.store.autoDismissQuestPopups) return;

        for (const mutation of mutations) {
            if (!hasClass(mutation.target, "layerContainer")) continue;

            for (const node of mutation.addedNodes)
                if (node instanceof HTMLElement && /(?:^|\s)layer_/.test(String(node.className)) && isModalLayer(node)) watchLayer(node);
        }
    });
    observer.observe(document.getElementById("app-mount") ?? document.body, { childList: true, subtree: true });
}

export function stopPopupWatcher() {
    observer?.disconnect();
    observer = null;

    [...releases].forEach(release => release());
    releases.clear();

    timers.forEach(clearTimeout);
    timers.clear();
}
