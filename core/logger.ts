/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { PLUGIN_NAME } from "./constants";
import { settings } from "./settings";

export const logger = new Logger(PLUGIN_NAME, "#5865f2");

export function debug(...args: unknown[]) {
    if (settings.store.debugMode) logger.log(...args);
}
