/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "@plugins/QuestAutoComplete/core/settings";
import { getGameName, getQuestName, getTarget } from "@plugins/QuestAutoComplete/core/types";
import { cancelQuest, getSessionPercent, getVersion as getSessionsVersion, subscribe as subscribeSessions } from "@plugins/QuestAutoComplete/quests/manager";
import { type QueuePreference, type QueueRow, sortRows } from "@plugins/QuestAutoComplete/queue/order";
import { getPreference, getRows, isQueueEnabled, setQueueEnabled } from "@plugins/QuestAutoComplete/queue/runner";
import { getVersion as getQueueVersion, isAccepting, removeFromQueue, subscribe as subscribeQueue } from "@plugins/QuestAutoComplete/queue/store";
import { classNameFactory } from "@utils/css";
import { Dialog, React, ScrollerThin } from "@webpack/common";

import { DiscordButton, DiscordSwitch, DiscordText } from "./DiscordButton";
import { CloseIcon } from "./icons";
import { getItems as getOverlayItems, subscribe as subscribeOverlay } from "./store";

const cl = classNameFactory("vc-qac-queue-");

function subtitleOf(row: QueueRow): string {
    if (!row.quest || !row.task) return "";

    const target = getTarget(row.quest, row.task);
    if (row.kind === "video") return `Video, ${target}s`;

    const what = row.task === "STREAM_ON_DESKTOP" ? "Stream" : row.task === "PLAY_ACTIVITY" ? "Activity" : "Game";
    return `${what}, ${getGameName(row.quest)}, ${Math.ceil(target / 60)} min`;
}

function stateOf(row: QueueRow, enabled: boolean): string {
    switch (row.state) {
        case "running": {
            const percent = getSessionPercent(row.entry.questId);
            return percent ? `Running ${percent}%` : "Running";
        }
        case "ready":
        case "needs-accept":
            if (!enabled) return "Paused";
            return isAccepting(row.entry.questId) ? "Accepting..." : "Waiting";
        case "unavailable": return "Unavailable";
    }
}

function statusLine(rows: QueueRow[], enabled: boolean): string {
    if (!enabled) return "Paused";
    if (rows.some(row => row.state === "running")) return "Collecting your Orbs...";
    return rows.length === 0 ? "Nothing to run" : "Getting ready...";
}

function QueueRowView({ row, enabled }: { row: QueueRow; enabled: boolean; }) {
    const name = row.quest ? getQuestName(row.quest) : "Unknown quest";

    return (
        <div className={cl("row")}>
            <div className={cl("info")}>
                <DiscordText variant="text-md/medium" color="text-strong" lineClamp={1}>{name}</DiscordText>
                <DiscordText variant="text-sm/normal" color="text-muted" lineClamp={1}>{subtitleOf(row)}</DiscordText>
            </div>
            <span className={cl("state", row.state)}>{stateOf(row, enabled)}</span>
            <DiscordButton
                size="xs"
                variant="secondary"
                icon={CloseIcon}
                aria-label={row.state === "running" ? `Stop ${name} and remove it from the queue` : `Remove ${name} from the queue`}

                onClick={() => row.state === "running" ? cancelQuest(row.entry.questId) : removeFromQueue(row.entry.questId)}
            />
        </div>
    );
}

function EmptyState() {
    return (
        <div className={cl("empty")}>
            <DiscordText variant="text-md/semibold" color="text-strong">No quests to complete?</DiscordText>
            <DiscordText variant="text-sm/normal" color="text-muted">Use "Add to queue" on a quest.</DiscordText>
        </div>
    );
}

const ORDER_OPTIONS: Array<{ value: QueuePreference; label: string; }> = [
    { value: "videos", label: "Videos" },
    { value: "games", label: "Games" }
];

export function QueuePanel() {
    const titleId = React.useId();

    React.useSyncExternalStore(subscribeQueue, getQueueVersion);
    React.useSyncExternalStore(subscribeSessions, getSessionsVersion);
    React.useSyncExternalStore(subscribeOverlay, getOverlayItems);
    settings.use(["queuePreference"]);

    const enabled = isQueueEnabled();
    const preference = getPreference();
    const rows = sortRows(getRows(), preference);

    return (
        <Dialog className={cl("panel")} aria-labelledby={titleId}>
            <div className={cl("head")}>
                <div className={cl("head-text")}>
                    <DiscordText id={titleId} variant="text-md/semibold" color="text-strong">Queue</DiscordText>
                    <DiscordText variant="text-sm/normal" color="text-muted">{statusLine(rows, enabled)}</DiscordText>
                </div>
                <DiscordSwitch
                    checked={enabled}
                    labelledBy={titleId}
                    onChange={setQueueEnabled}
                />
            </div>

            <DiscordText variant="text-sm/semibold" color="text-subtle" className={cl("heading")}>Run first</DiscordText>
            <div className={cl("segments")}>
                {ORDER_OPTIONS.map(option => (
                    <DiscordButton
                        key={option.value}
                        size="sm"
                        fullWidth
                        variant={preference === option.value ? "primary" : "secondary"}
                        text={option.label}
                        aria-pressed={preference === option.value}
                        onClick={() => { settings.store.queuePreference = option.value; }}
                    />
                ))}
            </div>

            <DiscordText variant="text-sm/semibold" color="text-subtle" className={cl("heading")}>
                {`Quests (${rows.length})`}
            </DiscordText>
            {rows.length === 0
                ? <EmptyState />

                : (
                    <ScrollerThin className={cl("list")} orientation="vertical" fade>
                        {rows.map(row => <QueueRowView key={row.entry.questId} row={row} enabled={enabled} />)}
                    </ScrollerThin>
                )}
        </Dialog>
    );
}
