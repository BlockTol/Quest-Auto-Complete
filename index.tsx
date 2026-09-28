/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, type NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";
import type { ComponentType } from "react";

import { enterAccount, leaveAccount } from "./accountChange";
import { SettingsAbout } from "./components/SettingsAbout";
import { currentUserId, getOwner, markQuestsLoaded, setOwner } from "./core/account";
import { PLUGIN_VERSION } from "./core/constants";
import { debug } from "./core/logger";
import { settings } from "./core/settings";
import { canAutomate, type Quest } from "./core/types";
import { cancelAll, cancelQuest, resetResume, resumeSavedQuests, startQuest } from "./quests/manager";
import { isQueueable } from "./queue/order";
import { scheduleTick, startQueue, stopQueue, toggleQueued } from "./queue/runner";
import { isQueued } from "./queue/store";
import managedStyle from "./styles.css?managed";
import { QueueIcon } from "./ui/icons";
import { notify } from "./ui/notify";
import { mountOverlay, unmountOverlay } from "./ui/Overlay";
import { dismissPrompts } from "./ui/pills";
import { startPopupWatcher, stopPopupWatcher } from "./ui/popups";
import { QuestButton } from "./ui/QuestButton";
import { QueueButton } from "./ui/QueueButton";
import { reset as resetOverlay } from "./ui/store";
import { startUpdateChecks, stopUpdateChecks } from "./ui/updatePrompt";

let lateResume: ReturnType<typeof setTimeout> | undefined;

const MENU_ANCHORS = ["share-link", "play-game", "display-disclosure"];

const questMenuPatch: NavContextMenuPatchCallback = (children, props: { quest?: Quest; }) => {
    const quest = props?.quest;
    if (!quest || !isQueueable(quest)) return;

    const group = findGroupChildrenByChildId(MENU_ANCHORS, children);
    if (!group) return;

    const anchor = MENU_ANCHORS.map(id => group.findIndex(child => child?.props?.id === id)).find(index => index >= 0) ?? group.length - 1;
    group.splice(anchor + 1, 0, (
        <Menu.MenuItem
            id="vc-qac-queue"
            label={isQueued(quest.id) ? "Remove from queue" : "Add to queue"}
            leadingAccessory={{ type: "icon", icon: QueueIcon }}
            action={() => toggleQueued(quest)}
        />
    ));
};

export default definePlugin({
    name: "QuestAutoComplete",
    description: "Complete Discord quests with smart automation and real-time progress tracking",
    authors: [{ id: 1449096170646536233n, name: "BlockTol" }],
    tags: ["Activity", "Utility", "Fun"],
    settings,
    managedStyle,
    settingsAboutComponent: SettingsAbout,

    patches: [
        {
            find: ".QUEST_HOME_TILE_FOOTER,analyticsCtxQuestContent",
            replacement: {
                match: /function (\i)\((\i)\)\{(let\{quest:\i,questContent:\i,contentPosition:\i,rowIndex:\i,sourceQuestContent:\i\}=\i,\i=\(0,\i\.\i\)\(\i\),\{isQuestEnrollmentBlocked:\i\}=\(0,\i\.\i\)\(\[\i\.\i\],\(\)=>\(\{isQuestEnrollmentBlocked:null!=\i\.\i\.questEnrollmentBlockedUntil\}\)\);return )/,
                replace: "function $1($2){return $self.renderFooter($2,$1Original)}function $1Original($2){$3"
            }
        },
        {
            find: /\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\)\]/,
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\))\]/,
                replace: "$1,$self.renderQueueButton()]"
            }
        },
        {
            find: ".QUEST_HOME_TILE_V2_FOOTER,analyticsCtxQuestContent",
            noWarn: true,
            replacement: {
                match: /(!\i&&!\i&&\(0,\i\.jsx\)\(\i\.\i,\{quest:(\i),surface:\i\.\i\.QUEST_HOME_TILE_V2_FOOTER,[^}]+\}\)),/,
                replace: "$1,$self.renderQuestButton($2),"
            }
        }
    ],

    contextMenus: {
        "quests-entry": questMenuPatch
    },

    flux: {
        LOGOUT() {
            leaveAccount();
        },

        CONNECTION_OPEN({ user }: { user?: { id?: string; }; }) {
            const id = user?.id ?? currentUserId();
            if (id && id !== getOwner()) enterAccount(id);
        },

        QUESTS_FETCH_CURRENT_QUESTS_SUCCESS() {
            markQuestsLoaded();
            void resumeSavedQuests().then(() => scheduleTick());
        },

        QUESTS_ENROLL_SUCCESS() {
            scheduleTick(500);
        }
    },

    renderFooter(props: { quest: Quest; }, Footer: ComponentType<any>) {
        return (
            <div className="vc-qac-footer">
                <Footer {...props} />
                {canAutomate(props.quest) && (
                    <div className="vc-qac-footer-row">
                        <ErrorBoundary noop>
                            <QuestButton quest={props.quest} />
                        </ErrorBoundary>
                    </div>
                )}
            </div>
        );
    },

    renderQueueButton() {
        return (
            <ErrorBoundary noop>
                <QueueButton />
            </ErrorBoundary>
        );
    },

    renderQuestButton(quest: Quest) {
        return (
            <ErrorBoundary noop>
                <QuestButton quest={quest} />
            </ErrorBoundary>
        );
    },

    start() {
        resetResume();

        setOwner(currentUserId(), { storeMayBeLoaded: true });
        mountOverlay();
        startPopupWatcher();
        startUpdateChecks();
        void startQueue();

        lateResume = setTimeout(() => void resumeSavedQuests().then(() => scheduleTick()), 10_000);

        debug(`v${PLUGIN_VERSION} started`);
    },

    stop() {
        clearTimeout(lateResume);
        stopUpdateChecks();
        stopPopupWatcher();

        stopQueue();
        cancelAll();
        dismissPrompts();
        resetOverlay();
        unmountOverlay();
        setOwner(null);
    },

    startQuest,
    cancelQuest,
    notify
});
