import { findByPropsLazy, findStoreLazy } from "@webpack";
export let QuestsStore: any = null;
export const RunningGameStore = findStoreLazy("RunningGameStore");
export const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");
export const ChannelStore = findStoreLazy("ChannelStore");
export const GuildChannelStore = findStoreLazy("GuildChannelStore");
export const api = findByPropsLazy("get", "post", "put", "patch");
function getWebpackRequire(): any {
    try {
        const webpackChunk = (window as any).webpackChunkdiscord_app;
        if (!webpackChunk) return null;
        const wpRequire = webpackChunk.push([[Symbol()], {}, (req: any) => req]);
        webpackChunk.pop();
        return wpRequire;
    } catch (e) {
        return null;
    }
}
function getWebpackModules(): any[] {
    const wpRequire = getWebpackRequire();
    if (!wpRequire?.c) return [];
    return Object.values(wpRequire.c);
}
export function initializeStores(): boolean {
    try {
        const modules = getWebpackModules();
        if (!modules || modules.length === 0) {
            console.error("[QuestAutoComplete] Webpack modules not accessible");
            return false;
        }
        function isFluxStore(obj: any): boolean {
            if (!obj) return false;
            return !!(
                obj._dispatcher ||
                obj.__proto__?._dispatcher ||
                obj.emitChange ||
                obj.__proto__?.emitChange
            );
        }
        QuestsStore = null;
        const originalWarn = console.warn;
        for (const mod of modules as any[]) {
            const exp = mod?.exports;
            if (!exp) continue;
            const candidates = [exp, exp.default, exp.Z, exp.ZP, exp.A];
            for (const c of candidates) {
                if (!c) continue;
                if ((c.getQuest || c.__proto__?.getQuest) && isFluxStore(c)) {
                    console.warn = () => {};
                    try {
                        const q = c.getQuest?.("1"); 
                        if (!q || (!q.locale && !q.ast)) {
                            QuestsStore = c;
                        }
                    } catch { }
                    console.warn = originalWarn;
                    if (QuestsStore) break;
                }
            }
            if (QuestsStore) break;
            for (const key of Object.keys(exp)) {
                const val = exp[key];
                if (!val) continue;
                if ((val.getQuest || val.__proto__?.getQuest) && isFluxStore(val)) {
                    console.warn = () => {};
                    try {
                        const q = val.getQuest?.("1");
                        if (!q || (!q.locale && !q.ast)) {
                            QuestsStore = val;
                        }
                    } catch { }
                    console.warn = originalWarn;
                    if (QuestsStore) break;
                }
            }
            if (QuestsStore) break;
        }
        const questsOk = !!QuestsStore;
        const apiOk = !!api;
        console.log("[QuestAutoComplete] Store status:", {
            QuestsStore: questsOk,
            RunningGameStore: !!RunningGameStore,
            ApplicationStreamingStore: !!ApplicationStreamingStore,
            ChannelStore: !!ChannelStore,
            GuildChannelStore: !!GuildChannelStore,
            api: apiOk,
        });
        if (questsOk) {
            try {
                const storeName = QuestsStore.getName?.();
                console.log("[QuestAutoComplete] QuestsStore name:", storeName);
                if (typeof QuestsStore.getQuests === "function") {
                    const quests = QuestsStore.getQuests();
                    const count = Array.isArray(quests) ? quests.length : Object.keys(quests || {}).length;
                    console.log("[QuestAutoComplete] Quests available:", count);
                    const questList = Array.isArray(quests) ? quests : Object.values(quests || {});
                    if (questList.length > 0) {
                        const first = questList[0] as any;
                        console.log("[QuestAutoComplete] First quest keys:", Object.keys(first));
                        console.log("[QuestAutoComplete] First quest sample:", {
                            id: first.id,
                            hasConfig: !!first.config,
                            hasUserStatus: !!first.userStatus,
                            hasTaskConfig: !!first.taskConfig,
                            configKeys: first.config ? Object.keys(first.config) : "none",
                        });
                    }
                }
            } catch (e) {
                console.warn("[QuestAutoComplete] Store inspection error:", e);
            }
        }
        if (!questsOk && !apiOk) {
            console.error("[QuestAutoComplete] Critical stores missing - plugin cannot function");
            return false;
        }
        console.log("[QuestAutoComplete] Stores initialized successfully");
        return true;
    } catch (error) {
        console.error("[QuestAutoComplete] Failed to initialize stores:", error);
        return false;
    }
}
export function findFluxDispatcher(): any {
    try {
        const mod = findByPropsLazy("dispatch", "subscribe");
        return mod || null;
    } catch {
        return null;
    }
}
