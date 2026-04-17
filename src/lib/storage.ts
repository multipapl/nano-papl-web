/**
 * LocalStorage-based persistence for API keys and settings.
 * All keys are prefixed with "nanopapl_" to avoid collisions.
 */

const PREFIX = "nanopapl_";

function key(name: string) {
    return `${PREFIX}${name}`;
}

/** Byte-size of all nanopapl_ keys in localStorage. */
export function getLocalStorageSize(): number {
    if (typeof window === "undefined") return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
            total += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2; // UTF-16
        }
    }
    return total;
}

/** Remove every nanopapl_ key from localStorage (API keys included). */
export function clearAllLocalStorage(): void {
    if (typeof window === "undefined") return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export const storage = {
    // ─── API Keys ───
    getGeminiKey: () => {
        if (typeof window === "undefined") return "";
        return localStorage.getItem(key("gemini_key")) || "";
    },
    setGeminiKey: (v: string) => {
        localStorage.setItem(key("gemini_key"), v);
    },

    getFalKey: () => {
        if (typeof window === "undefined") return "";
        return localStorage.getItem(key("fal_key")) || "";
    },
    setFalKey: (v: string) => {
        localStorage.setItem(key("fal_key"), v);
    },

    getOpenRouterKey: () => {
        if (typeof window === "undefined") return "";
        return localStorage.getItem(key("openrouter_key")) || "";
    },
    setOpenRouterKey: (v: string) => {
        localStorage.setItem(key("openrouter_key"), v);
    },

    // ─── Active Provider/Model ───
    getActiveProvider: (): string => {
        if (typeof window === "undefined") return "gemini";
        return localStorage.getItem(key("active_provider")) || "gemini";
    },
    setActiveProvider: (v: string) => {
        localStorage.setItem(key("active_provider"), v);
    },

    getActiveModel: (): string => {
        if (typeof window === "undefined") return "gemini-3-pro-image-preview";
        return localStorage.getItem(key("active_model")) || "gemini-3-pro-image-preview";
    },
    setActiveModel: (v: string) => {
        localStorage.setItem(key("active_model"), v);
    },

    // ─── Chat History ───
    getChatHistory: (): ChatSession[] => {
        if (typeof window === "undefined") return [];
        try {
            return JSON.parse(localStorage.getItem(key("chat_sessions")) || "[]");
        } catch { return []; }
    },
    saveChatHistory: (sessions: ChatSession[]) => {
        // Strip base64 imageData before saving to localStorage (too large).
        // Mark with "[image]" so we know to look up the real data in IndexedDB.
        const stripped = sessions.map(s => ({
            ...s,
            messages: s.messages.map(m => ({
                ...m,
                imageData: (m.imageData && m.imageData !== "[image]") ? "[image]" : m.imageData,
            })),
        }));
        try {
            localStorage.setItem(key("chat_sessions"), JSON.stringify(stripped));
        } catch (e) {
            console.warn("Failed to save chat history:", e);
        }
    },

    // ─── Generic ───
    get: (name: string) => {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(key(name));
    },
    set: (name: string, value: string) => {
        localStorage.setItem(key(name), value);
    },
};

// ─── Types ───

export interface ChatMessage {
    id: string;
    role: "user" | "model";
    text: string;
    imageData?: string; // base64 data URL
    timestamp: number;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    folder?: string;
}

export function createChatSession(title?: string): ChatSession {
    return {
        id: crypto.randomUUID(),
        title: title || "New Chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

export function createMessage(role: "user" | "model", text: string, imageData?: string): ChatMessage {
    return {
        id: crypto.randomUUID(),
        role,
        text,
        imageData,
        timestamp: Date.now(),
    };
}
