import { findByPropsLazy } from "@webpack";
const AuthStore = findByPropsLazy("getToken");
export function getDiscordToken(): string {
    try {
        const token = AuthStore?.getToken?.();
        if (typeof token === "string" && token.length > 50) {
            return token;
        }
    } catch (e) {
        console.error("[QuestAutoComplete] Token error:", e);
    }
    console.error("[QuestAutoComplete] Failed to get Discord token");
    return "";
}
export async function discordApiGet(endpoint: string): Promise<any> {
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");
    const response = await fetch(`/api/v9${endpoint}`, {
        method: "GET",
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        const error: any = new Error(`API GET failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}
export async function discordApiPost(endpoint: string, body: any): Promise<any> {
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");
    const response = await fetch(`/api/v9${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        let errorBody = "";
        try {
            errorBody = await response.text();
            console.error("[QuestAutoComplete] API Error Body:", errorBody);
        } catch (e) { }
        const error: any = new Error(`API POST failed: ${response.status}`);
        error.status = response.status;
        error.body = errorBody;
        throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
}
export async function rateLimitedPost(
    endpoint: string,
    body: any,
    maxRetries = 5
): Promise<any> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await discordApiPost(endpoint, body);
        } catch (error: any) {
            const status = error?.status || error?.response?.status;
            if (status === 429 || (error?.message && error.message.includes("rate limit"))) {
                const waitTime = Math.min(2000 * (attempt + 1), 15000);
                console.warn(`[QuestAutoComplete] Rate limited, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded due to rate limiting");
}
