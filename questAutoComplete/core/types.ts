export interface Quest {
    id: string;
    config: {
        application: { id: string; name: string };
        expiresAt: string;
        messages: { questName: string };
        taskConfig?: any;
        taskConfigV2?: any;
        configVersion: number;
    };
    userStatus: {
        enrolledAt: string;
        completedAt?: string;
        progress?: any;
        streamProgressSeconds?: number;
    };
}
export interface QuestData {
    questId: string;
    userId: string;
    taskType: string;
    isProcessing: boolean;
    timeoutIds: number[];
    intervalIds: number[];
    lastProgress: number;
    targetProgress: number;
}
export interface SavedQuestState {
    questId: string;
    taskType: string;
    startedAt: number;
}
export const QUEST_TASK_TYPES = {
    VIDEO: ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP"] as const,
    PLAY: ["PLAY_ON_DESKTOP"] as const,
    STREAM: ["STREAM_ON_DESKTOP"] as const,
    ACTIVITY: ["PLAY_ACTIVITY", "ACHIEVEMENT_IN_ACTIVITY"] as const,
};
export const ALL_TASK_TYPES = [
    ...QUEST_TASK_TYPES.VIDEO,
    ...QUEST_TASK_TYPES.PLAY,
    ...QUEST_TASK_TYPES.STREAM,
    ...QUEST_TASK_TYPES.ACTIVITY,
] as const;
export type TaskType = typeof ALL_TASK_TYPES[number];
export function isVideoTask(taskType: string): boolean {
    return (QUEST_TASK_TYPES.VIDEO as readonly string[]).includes(taskType);
}
