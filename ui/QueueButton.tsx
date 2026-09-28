/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getEntries, getVersion, subscribe } from "@plugins/QuestAutoComplete/queue/store";
import { Popout, React } from "@webpack/common";

import { DiscordButton } from "./DiscordButton";
import { QueueIcon } from "./icons";
import { QueuePanel } from "./QueuePanel";

export function QueueButton() {
    const buttonRef = React.useRef<HTMLElement>(null);
    React.useSyncExternalStore(subscribe, getVersion);

    const count = getEntries().length;

    return (
        <Popout
            position="bottom"
            align="right"
            targetElementRef={buttonRef}
            renderPopout={() => <QueuePanel />}
        >
            {props => (
                <DiscordButton
                    {...props}
                    buttonRef={buttonRef}
                    size="sm"
                    variant="secondary"
                    text={count > 0 ? `Queue (${count})` : "Queue"}
                    icon={QueueIcon}
                    iconPosition="end"
                    aria-label="Quest queue"
                />
            )}
        </Popout>
    );
}
