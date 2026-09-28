/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { createRoot, React } from "@webpack/common";
import type { Root } from "react-dom/client";

import {
    getItems,
    type PillItem,
    type PromptItem,
    subscribe,
    type ToastItem } from "./store";

const cl = classNameFactory("vc-qac-");

const PERCENT_LABEL: Record<Exclude<PillItem["status"], "running">, string> = {
    completed: "Done",
    failed: "Error",
    incomplete: "Retry",
    cancelled: "Stopped"
};

function useLeaving(closing: boolean) {
    const ref = React.useRef<HTMLDivElement>(null);
    const height = React.useRef(0);

    if (closing && !height.current && ref.current) height.current = ref.current.offsetHeight;

    const style = closing && height.current ? { "--vc-qac-h": `${height.current}px` } as React.CSSProperties : undefined;
    return { ref, style };
}

function Pill({ item }: { item: PillItem; }) {
    const running = item.status === "running";
    const percent = running ? `${Math.min(99, item.percent)}%` : PERCENT_LABEL[item.status];
    const leaving = useLeaving(item.closing);

    return (
        <div className={cl("row", { leaving: item.closing })} ref={leaving.ref} style={leaving.style}>
            <div className={cl("pill", item.status, { done: !running, hiding: item.closing })}>
                <div className={cl("compact")}>
                    <div className={cl("spinner")} />
                    <span className={cl("title")}>{item.title}</span>
                    <span className={cl("percent")}>{percent}</span>
                </div>
                <div className={cl("expanded")}>
                    <div className={cl("expanded-inner")}>
                        <div className={cl("body")}>{item.body}</div>
                        <div className={cl("bar")}>
                            <div className={cl("fill")} style={{ transform: `scaleX(${Math.min(1, Math.max(0, item.percent / 100))})` }} />
                        </div>
                        {item.onCancel && (
                            <div className={cl("actions")}>
                                <button className={cl("btn", "danger")} onClick={item.onCancel}>Cancel</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {item.slide && (
                <div key={item.slide.nonce} className={cl("slide", item.slide.tone)}>
                    <span className={cl("slide-text")}>{item.slide.text}</span>
                </div>
            )}
        </div>
    );
}

function Toast({ item }: { item: ToastItem; }) {
    const leaving = useLeaving(item.closing);

    return (
        <div className={cl("toast", item.tone, { hiding: item.closing })} ref={leaving.ref} style={leaving.style}>
            <div className={cl("toast-content")}>
                {item.title && <div className={cl("toast-title")}>{item.title}</div>}
                {item.body && <div className={cl("toast-body")}>{item.body}</div>}
            </div>
        </div>
    );
}

function Prompt({ item }: { item: PromptItem; }) {
    const leaving = useLeaving(item.closing);

    return (
        <div className={cl("row", { leaving: item.closing })} ref={leaving.ref} style={leaving.style}>
            <div className={cl("pill", "prompt", { hiding: item.closing })}>
                <div className={cl("prompt-title")}>{item.title}</div>
                <div className={cl("body")}>{item.body}</div>
                <div className={cl("actions")}>
                    {item.actions.map(action => (
                        <button
                            key={action.label}
                            className={cl("btn", action.variant)}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Overlay() {
    const items = React.useSyncExternalStore(subscribe, getItems);

    return (
        <div className={cl("container")}>
            {items.map(item => {
                switch (item.kind) {
                    case "pill": return <Pill key={item.id} item={item} />;
                    case "toast": return <Toast key={item.id} item={item} />;
                    case "prompt": return <Prompt key={item.id} item={item} />;
                }
            })}
        </div>
    );
}

let host: HTMLElement | null = null;
let root: Root | null = null;

export function mountOverlay() {
    if (host) return;

    host = document.createElement("div");
    host.id = "vc-qac-root";
    document.body.append(host);

    root = createRoot(host);
    root.render(<Overlay />);
}

export function unmountOverlay() {
    root?.unmount();
    host?.remove();
    root = host = null;
}
