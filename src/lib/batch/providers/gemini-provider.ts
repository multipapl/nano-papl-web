/**
 * Gemini image generation provider.
 * Wraps the existing /api/gemini proxy route to conform to ImageProvider interface.
 */

import type { ImageProvider, GenerationParams, GenerationResult } from "./types";
import { assertSafePayloadSize } from "@/lib/payload-limits";

export class GeminiProvider implements ImageProvider {
    readonly name = "Google Gemini";
    private apiKey: string;
    private modelId: string;

    constructor(apiKey: string, modelId = "gemini-3-pro-image-preview") {
        this.apiKey = apiKey;
        this.modelId = modelId;
    }

    async generate(params: GenerationParams): Promise<GenerationResult> {
        const start = performance.now();

        try {
            // Extract raw base64 from data URL
            const match = params.inputImage.match(/^data:(.+?);base64,(.+)$/);
            if (!match) {
                return { success: false, error: "Invalid input image format" };
            }
            const [, mimeType, imageData] = match;

            // Build contents for Gemini API
            const contents = [
                {
                    role: "user",
                    parts: [
                        { text: params.prompt },
                        { inlineData: { mimeType, data: imageData } },
                    ],
                },
            ];

            // Image config
            const imageConfig: Record<string, string> = {
                imageSize: params.resolution,
            };
            if (params.aspectRatio && params.aspectRatio !== "Auto") {
                imageConfig.aspectRatio = params.aspectRatio;
            }

            // NOTE: signal is intentionally NOT passed to fetch() so that
            // in-flight requests complete naturally. The batch engine checks
            // signal.aborted between tasks to implement graceful stop.
            const payload = JSON.stringify({
                apiKey: this.apiKey,
                modelId: this.modelId,
                contents,
                systemInstruction: "You are an architectural visualization AI. Generate the image exactly as described in the prompt. Do not add text overlays.",
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig,
            });
            assertSafePayloadSize(payload, "Gemini request");

            const res = await fetch("/api/gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                return {
                    success: false,
                    error: data.error || `API error: ${res.status}`,
                    metadata: { duration: performance.now() - start },
                };
            }

            // Parse response
            const candidates = data.candidates || [];
            if (candidates.length === 0) {
                return {
                    success: false,
                    error: "No candidates in response",
                    metadata: { duration: performance.now() - start },
                };
            }

            const parts = candidates[0]?.content?.parts || [];
            let resultImageData: string | undefined;

            for (const part of parts) {
                if (part.inlineData) {
                    resultImageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    break;
                }
            }

            if (!resultImageData) {
                const blockReason = candidates[0]?.finishReason;
                if (blockReason && blockReason !== "STOP") {
                    return {
                        success: false,
                        error: `Response blocked: ${blockReason}`,
                        metadata: { duration: performance.now() - start },
                    };
                }
                return {
                    success: false,
                    error: "No image in response",
                    metadata: { duration: performance.now() - start },
                };
            }

            return {
                success: true,
                imageDataUrl: resultImageData,
                metadata: {
                    duration: performance.now() - start,
                    format: resultImageData.startsWith("data:image/png") ? "PNG" : "JPG",
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
