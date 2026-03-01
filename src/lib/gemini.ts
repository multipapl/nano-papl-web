/**
 * Gemini API client for the web app.
 * Calls our Next.js API route which proxies to the actual Gemini API.
 */

import type { ChatMessage } from "./storage";

export interface GeminiConfig {
    model: string;
    resolution: string;
    ratio: string;
}

// Available models — matches the original Python app
export const GEMINI_MODELS = [
    { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro (Image)", supportsImages: true },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", supportsImages: false },
] as const;

export const DEFAULT_MODEL = GEMINI_MODELS[0].id;

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
}

export interface GeminiResponse {
    text: string;
    imageData?: string; // base64
    error?: string;
}

/**
 * Convert our ChatMessage history to Gemini-compatible format
 */
function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
    return messages.map((msg) => {
        const parts: GeminiPart[] = [];
        if (msg.text) {
            parts.push({ text: msg.text });
        }
        // We don't send image history back (too large), only text
        return {
            role: msg.role,
            parts: parts.length ? parts : [{ text: " " }],
        };
    });
}

/**
 * Send a chat message to Gemini via our API proxy.
 */
export async function sendGeminiMessage(
    apiKey: string,
    messages: ChatMessage[],
    userText: string,
    userImageBase64: string | null,
    config: GeminiConfig,
    systemInstruction?: string,
): Promise<GeminiResponse> {
    // Build user content parts
    const userParts: GeminiPart[] = [];
    if (userText) {
        userParts.push({ text: userText });
    }
    if (userImageBase64) {
        // Extract mime and data from data URL
        const match = userImageBase64.match(/^data:(.+?);base64,(.+)$/);
        if (match) {
            userParts.push({
                inlineData: { mimeType: match[1], data: match[2] },
            });
        }
    }

    // Build full contents array (history + current message)
    const history = toGeminiHistory(messages);
    const contents: GeminiContent[] = [
        ...history,
        { role: "user", parts: userParts },
    ];

    // Determine if model supports image output
    const modelInfo = GEMINI_MODELS.find((m) => m.id === config.model);
    const supportsImages = modelInfo?.supportsImages ?? false;

    const responseModalities = supportsImages ? ["TEXT", "IMAGE"] : ["TEXT"];

    const imageConfig = supportsImages
        ? {
            imageSize: config.resolution || "1024x1024",
            ...(config.ratio && config.ratio !== "auto" ? { aspectRatio: config.ratio } : {}),
        }
        : undefined;

    try {
        const res = await fetch("/api/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                apiKey,
                modelId: config.model,
                contents,
                systemInstruction: systemInstruction || "You are a helpful AI assistant for architectural visualization. Help the user with their questions and generate images when requested.",
                responseModalities,
                imageConfig,
            }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
            return { text: "", error: data.error || `API error: ${res.status}` };
        }

        // Parse response
        let text = "";
        let imageData: string | undefined;

        const candidates = data.candidates || [];
        if (candidates.length > 0) {
            const parts = candidates[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.text) {
                    text += part.text;
                }
                if (part.inlineData) {
                    imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }

        if (!text && !imageData) {
            // Check for blocked or empty response
            const blockReason = candidates[0]?.finishReason;
            if (blockReason && blockReason !== "STOP") {
                return { text: "", error: `Response blocked: ${blockReason}` };
            }
        }

        return { text: text.trim(), imageData };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error";
        return { text: "", error: message };
    }
}

/**
 * Read a File as a base64 data URL
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
