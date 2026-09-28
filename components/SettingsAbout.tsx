/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PLUGIN_VERSION } from "@plugins/QuestAutoComplete/core/constants";
import { DiscordButton } from "@plugins/QuestAutoComplete/ui/DiscordButton";
import { runUpdateCheck, type UpdateResult } from "@plugins/QuestAutoComplete/ui/updatePrompt";
import { classNameFactory } from "@utils/css";
import { React } from "@webpack/common";

const cl = classNameFactory("vc-qac-about-");

type Status = { text: string; tone: "ok" | "warn" | "bad" | "muted"; };

function describe(result: UpdateResult): Status {
    switch (result.state) {
        case "available": return { text: `Update available: v${result.version}`, tone: "warn" };
        case "latest": return { text: "You're up to date!", tone: "ok" };
        case "none": return { text: "No releases found", tone: "muted" };
        case "failed": return { text: "Check failed", tone: "bad" };
    }
}

export function SettingsAbout() {
    const [checking, setChecking] = React.useState(false);
    const [status, setStatus] = React.useState<Status | null>(null);

    const check = async () => {
        setChecking(true);
        setStatus({ text: "Checking...", tone: "muted" });

        setStatus(describe(await runUpdateCheck(true)));
        setChecking(false);
    };

    return (
        <div className={cl("root")}>
            <div>
                <div className={cl("title")}>Quest Auto Complete</div>
                <div className={cl("subtitle")}>
                    Version: <span className={cl("version")}>v{PLUGIN_VERSION}</span>
                    {status && <span className={cl("status", status.tone)}>{status.text}</span>}
                </div>
            </div>
            <DiscordButton size="sm" variant="secondary" text="Check for Updates" loading={checking} onClick={check} />
        </div>
    );
}
