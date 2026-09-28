/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show toast notifications for quest events (errors are always shown)",
        default: true
    },
    notificationDuration: {
        type: OptionType.SLIDER,
        description: "How long notifications stay on screen (seconds)",
        default: 4,
        markers: [1, 2, 3, 4, 6, 8, 10]
    },
    autoResumeAfterReload: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume quest automation after Discord reload",
        default: true
    },
    showProgressBar: {
        type: OptionType.BOOLEAN,
        description: "Show a progress bar for active quests",
        default: true
    },
    autoDismissQuestPopups: {
        type: OptionType.BOOLEAN,
        description: "Automatically dismiss quest video and mobile QR code popups",
        default: true
    },
    activityHeartbeat: {
        type: OptionType.SELECT,
        description: "How often activity quests (PLAY_ACTIVITY) report progress. The Discord client itself reports once a minute.",
        options: [
            { label: "Fast, about every second (previous behaviour)", value: "fast", default: true },
            { label: "Balanced, about every 20 seconds", value: "balanced" },
            { label: "Official pace, every 60 seconds", value: "official" }
        ]
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable debug logging in the console (useful for troubleshooting)",
        default: false
    },

    queueEnabled: {
        type: OptionType.BOOLEAN,
        description: "Run the quests in the queue automatically (legacy, see the queue popout)",
        default: true,
        hidden: true
    },
    queuePreference: {
        type: OptionType.SELECT,
        description: "Which kind of quest the queue runs first",
        options: [
            { label: "Videos first", value: "videos", default: true },
            { label: "Games first", value: "games" }
        ],
        hidden: true
    }
});
