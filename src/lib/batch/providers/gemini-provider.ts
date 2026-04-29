/**
 * Gemini image generation provider.
 * Uses the direct Gemini Files API + generateContent flow without the Vercel proxy.
 */

import type { ImageProvider, GenerationParams, GenerationResult } from "./types";
import {
    requestGeminiContent,
    uploadGeminiDataUrl,
    type GeminiUploadedFile,
} from "@/lib/gemini";

export class GeminiProvider implements ImageProvider {
    readonly name = "Google Gemini";
    private apiKey: string;
    private modelId: string;
    private uploadCache = new Map<string, Promise<GeminiUploadedFile>>();

    constructor(apiKey: string, modelId = "gemini-3-pro-image-preview") {
        this.apiKey = apiKey;
        this.modelId = modelId;
    }

    private getUploadedFile(dataUrl: string): Promise<GeminiUploadedFile> {
        const cached = this.uploadCache.get(dataUrl);
        if (cached) return cached;

        const upload = uploadGeminiDataUrl(this.apiKey, dataUrl, "batch-input");
        this.uploadCache.set(dataUrl, upload);
        return upload;
    }

    async generate(params: GenerationParams): Promise<GenerationResult> {
        const start = performance.now();

        try {
            if (!params.inputImage) {
                return { success: false, error: "Gemini batch generation requires an input image" };
            }

            const uploadedFile = await this.getUploadedFile(params.inputImage);
            const contents = [
                {
                    role: "user" as const,
                    parts: [
                        { fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri } },
                        { text: params.prompt },
                    ],
                },
            ];

            const imageConfig: Record<string, string> = {
                imageSize: params.resolution,
            };
            if (params.aspectRatio && params.aspectRatio !== "Auto") {
                imageConfig.aspectRatio = params.aspectRatio;
            }

            const response = await requestGeminiContent(this.apiKey, {
                modelId: this.modelId,
                contents,
                systemInstruction: "You are an architectural visualization AI. Generate the image exactly as described in the prompt. Do not add text overlays.",
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig,
            });

            if (response.error) {
                return {
                    success: false,
                    error: response.error,
                    metadata: { duration: performance.now() - start },
                };
            }

            if (!response.imageData) {
                return {
                    success: false,
                    error: "No image in response",
                    metadata: { duration: performance.now() - start },
                };
            }

            return {
                success: true,
                imageDataUrl: response.imageData,
                metadata: {
                    duration: performance.now() - start,
                    format: response.imageData.startsWith("data:image/png") ? "PNG" : "JPG",
                },
            };
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") {
                return {
                    success: false,
                    error: "Request aborted",
                    metadata: { duration: performance.now() - start },
                };
            }
            const message = err instanceof Error ? err.message : "Unknown error";
            return {
                success: false,
                error: message,
                metadata: { duration: performance.now() - start },
            };
        }
    }
}
