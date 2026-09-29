/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BlockTol
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getApplicationId, getGameName, progressOf } from "../core/types";
import type { FakeGame, QuestDeps } from "./contracts";
import { waitForServerProgress } from "./progress";
import type { QuestSession } from "./session";

const GRACE_MS = 3 * 60_000;
const STALL_MS = 5 * 60_000;

const randomPid = () => Math.floor(Math.random() * 30000) + 1000;

interface PublicApplication {
    name?: string;
    executables?: Array<{ os: string; name: string; }>;
}

async function lookupApplication(applicationId: string, session: QuestSession, deps: QuestDeps): Promise<PublicApplication | null> {
    try {
        const apps = await deps.api.get(`/applications/public?application_ids=${applicationId}`, session.signal);
        return Array.isArray(apps) ? apps[0] ?? null : null;
    } catch (error) {
        if (!session.active) throw error;
        deps.warn("Could not fetch the game's details, using a generated executable name", error);
        return null;
    }
}

export async function runPlay(session: QuestSession, deps: QuestDeps): Promise<boolean> {
    const { quest, task, target } = session;

    if (!(target > 0)) throw new Error("Invalid quest configuration");

    const applicationId = getApplicationId(quest, task);
    if (!applicationId) throw new Error("Could not find the game for this quest");

    const app = await lookupApplication(applicationId, session, deps);
    const name = app?.name ?? getGameName(quest);
    const exeName = app?.executables?.find(exe => exe.os === "win32")?.name?.replace(">", "")
        ?? `${name.toLowerCase().replace(/\s+/g, "")}.exe`;
    const pid = randomPid();

    const game: FakeGame = {
        cmdLine: `C:\\Program Files\\${name}\\${exeName}`,
        exeName,
        exePath: `c:/program files/${name.toLowerCase()}/${exeName}`,
        hidden: false,
        isLauncher: false,
        id: applicationId,
        name,
        pid,
        pidPath: [pid],
        processName: name,
        start: deps.now()
    };

    session.onCleanup(deps.spoofGame(game));
    deps.debug(`Spoofed game: ${name} (pid ${pid}, application ${applicationId})`);

    const remaining = Math.max(0, target - progressOf(deps.getQuest(session.id)?.userStatus ?? quest.userStatus, task));
    session.say(`Auto-completing: ${name}. Wait ~${Math.ceil(remaining / 60)} minutes.`);

    await waitForServerProgress(session, deps, { graceMs: GRACE_MS, stallMs: STALL_MS });
    return true;
}
