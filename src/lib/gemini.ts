/**
 * Direct Gemini API client for the web app.
 * Uses the Files API for image uploads and calls Gemini without the Vercel proxy.
 */

import type { ChatMessage } from "./storage";
import { dataUrlToBlob, getExtensionForMimeType, getMimeTypeFromDataUrl } from "./data-url";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/files";

export interface GeminiConfig {
    model: string;
    resolution: string;
    ratio: string;
}

// Available models â€” matches the original Python app
export const GEMINI_MODELS = [
    { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro (Image)", supportsImages: true },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", supportsImages: false },
] as const;

export const DEFAULT_MODEL = GEMINI_MODELS[0].id;

export interface GeminiUploadedFile {
    name: string;
    mimeType: string;
    uri: string;
    state?: string;
}

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
    fileData?: { mimeType: string; fileUri: string };
}

export interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
}

export interface GeminiRequestPayload {
    modelId: string;
    contents: GeminiContent[];
    systemInstruction?: string;
    responseModalities?: string[];
    imageConfig?: Record<string, unknown>;
}

export interface GeminiResponse {
    text: string;
    imageData?: string; // base64
    error?: string;
}

function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
    return messages.map((msg) => {
        const parts: GeminiPart[] = [];
        if (msg.text) {
            parts.push({ text: msg.text });
        }
        return {
            role: msg.role,
            parts: parts.length ? parts : [{ text: " " }],
        };
    });
}

function getGeminiImageConfig(config: GeminiConfig, supportsImages: boolean): Record<string, unknown> | undefined {
    if (!supportsImages) return undefined;

    const imageConfig: Record<string, unknown> = {
        imageSize: config.resolution || "1K",
    };

    if (config.ratio && config.ratio !== "Auto") {
        imageConfig.aspectRatio = config.ratio;
    }

    return imageConfig;
}

function normalizeGeminiFile(raw: unknown): GeminiUploadedFile {
    const file = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};

    return {
        name: typeof file.name === "string" ? file.name : "",
        mimeType: typeof file.mimeType === "string" ? file.mimeType : "",
        uri: typeof file.uri === "string" ? file.uri : "",
        state: typeof file.state === "string" ? file.state : undefined,
    };
}

async function readGeminiError(response: Response): Promise<string> {
    const fallback = `Gemini API error: ${response.status}`;
    try {
        const data = await response.json();
        return data?.error?.message || data?.message || fallback;
    } catch {
        return fallback;
    }
}

async function waitForGeminiFileActive(apiKey: string, initialFile: GeminiUploadedFile): Promise<GeminiUploadedFile> {
    let file = initialFile;

    for (let attempt = 0; attempt < 20; attempt++) {
        if (!file.state || file.state === "ACTIVE") {
            return file;
        }
        if (file.state === "FAILED") {
            throw new Error("Gemini file upload failed during processing");
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        const res = await fetch(`${GEMINI_API_BASE}/${file.name}?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) {
            throw new Error(await readGeminiError(res));
        }
        const data = await res.json();
        file = normalizeGeminiFile(data.file ?? data);
    }

    return file;
}

export async function uploadGeminiDataUrl(
    apiKey: string,
    dataUrl: string,
    displayName = "chat-image",
): Promise<GeminiUploadedFile> {
    const blob = dataUrlToBlob(dataUrl);
    const mimeType = getMimeTypeFromDataUrl(dataUrl) || blob.type || "image/jpeg";

    const startRes = await fetch(`${GEMINI_UPLOAD_BASE}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": String(blob.size),
            "X-Goog-Upload-Header-Content-Type": mimeType,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            file: {
                displayName: `${displayName}.${getExtensionForMimeType(mimeType)}`,
            },
        }),
    });

    if (!startRes.ok) {
        throw new Error(await readGeminiError(startRes));
    }

    const uploadUrl = startRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
        throw new Error("Gemini upload URL was not returned");
    }

    const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "Content-Length": String(blob.size),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        },
        body: blob,
    });

    if (!uploadRes.ok) {
        throw new Error(await readGeminiError(uploadRes));
    }

    const uploadData = await uploadRes.json();
    const file = normalizeGeminiFile(uploadData.file ?? uploadData);
    if (!file.name || !file.uri || !file.mimeType) {
        throw new Error("Gemini file upload returned incomplete metadata");
    }

    return waitForGeminiFileActive(apiKey, file);
}

export async function requestGeminiContent(
    apiKey: string,
    request: GeminiRequestPayload,
): Promise<GeminiResponse> {
    try {
        const requestBody: Record<string, unknown> = {
            contents: request.contents,
            generationConfig: {
                temperature: 0.7,
                ...(request.responseModalities?.length ? { responseModalities: request.responseModalities } : {}),
                ...(request.imageConfig ? { imageConfig: request.imageConfig } : {}),
            },
        };

        if (request.systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: request.systemInstruction }],
            };
        }

        const res = await fetch(`${GEMINI_API_BASE}/models/${request.modelId}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
            return { text: "", error: data?.error?.message || data?.error || `Gemini API error: ${res.status}` };
        }

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

export async function sendGeminiMessage(
    apiKey: string,
    messages: ChatMessage[],
    userText: string,
    userImagesBase64: string[],
    config: GeminiConfig,
    systemInstruction?: string,
): Promise<GeminiResponse> {
    const userParts: GeminiPart[] = [];

    const uploadedFiles = await Promise.all(
        userImagesBase64.map((image, index) => uploadGeminiDataUrl(apiKey, image, `chat-image-${Date.now()}-${index + 1}`)),
    );

    for (const file of uploadedFiles) {
        userParts.push({
            fileData: { mimeType: file.mimeType, fileUri: file.uri },
        });
    }

    if (userText) {
        userParts.push({ text: userText });
    }

    const history = toGeminiHistory(messages);
    const contents: GeminiContent[] = [
        ...history,
        { role: "user", parts: userParts.length > 0 ? userParts : [{ text: " " }] },
    ];

    const modelInfo = GEMINI_MODELS.find((m) => m.id === config.model);
    const supportsImages = modelInfo?.supportsImages ?? false;

    return requestGeminiContent(apiKey, {
        modelId: config.model,
        contents,
        systemInstruction: systemInstruction || "You are a helpful AI assistant for architectural visualization. Help the user with their questions and generate images when requested.",
        responseModalities: supportsImages ? ["TEXT", "IMAGE"] : ["TEXT"],
        imageConfig: getGeminiImageConfig(config, supportsImages),
    });
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
