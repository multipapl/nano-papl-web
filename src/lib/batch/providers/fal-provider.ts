/**
 * Fal.ai image generation provider.
 * Thin wrapper: picks the right endpoint (base/edit) and delegates
 * input-building to the model's own adapter in the registry.
 */

import type { ImageProvider, GenerationParams, GenerationResult } from "./types";
import { getModel } from "@/lib/providers/registry";
import type { ImageSize } from "@/lib/providers/types";
import { assertSafePayloadSize } from "@/lib/payload-limits";

/**
 * Map resolution string ("1K", "2K", "4K") to pixel dimensions for fal models
 * that expect explicit image_size (FLUX). Models that accept "resolution" string
 * directly (Nano Banana) ignore this — their buildInput reads params.resolution.
 */
function resolutionToSize(resolution: string, aspectRatio: string): ImageSize {
    const bases: Record<string, ImageSize> = {
        "1K": { width: 1024, height: 576 },
        "2K": { width: 2048, height: 1152 },
        "4K": { width: 3840, height: 2160 },
    };
    const base = bases[resolution] || bases["1K"];

    if (aspectRatio && aspectRatio !== "Auto") {
        const [w, h] = aspectRatio.split(":").map(Number);
        if (w && h) {
            return { width: base.width, height: Math.round(base.width * (h / w)) };
        }
    }

    return base;
}

/**
 * Candidate aspect ratios for Auto-resolution. Kept conservative — these are
 * widely supported by fal image models (FLUX.2, Nano Banana, etc.).
 */
const AUTO_CANDIDATE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"];

/** Read natural dimensions from a base64 data URL (browser only). */
async function detectImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Failed to decode input image"));
        img.src = dataUrl;
    });
}

/** Pick the candidate ratio closest to the input image's actual ratio (log-distance). */
function findClosestRatio(width: number, height: number): string {
    const target = Math.log(width / height);
    let best = AUTO_CANDIDATE_RATIOS[0];
    let bestDiff = Infinity;
    for (const c of AUTO_CANDIDATE_RATIOS) {
        const [w, h] = c.split(":").map(Number);
        const diff = Math.abs(Math.log(w / h) - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = c;
        }
    }
    return best;
}

export class FalProvider implements ImageProvider {
    readonly name = "Fal.ai";
    private apiKey: string;
    private modelId: string;

    constructor(apiKey: string, modelId: string) {
        this.apiKey = apiKey;
        this.modelId = modelId;
    }

    async generate(params: GenerationParams): Promise<GenerationResult> {
        const start = performance.now();

        const model = getModel(this.modelId);
        if (!model?.fal) {
            return {
                success: false,
                error: `Unknown fal model: ${this.modelId}`,
                metadata: { duration: performance.now() - start },
            };
        }

        // Pick endpoint: use edit variant when we have an input image and the model supports it.
        const hasInputImage = !!params.inputImage;
        if (hasInputImage && !model.fal.endpointEdit && !model.capabilities.imageToImage) {
            return {
                success: false,
                error: `${model.label} does not support image-to-image`,
                metadata: { duration: performance.now() - start },
            };
        }
        const endpoint = hasInputImage && model.fal.endpointEdit
            ? model.fal.endpointEdit
            : model.fal.endpoint;

        try {
            // Resolve "Auto" → closest concrete ratio from input image dimensions.
            // Makes Auto behaviour consistent across models (esp. FLUX.2, whose API
            // has no "auto" enum value) and predictable in Batch with mixed-ratio inputs.
            let effectiveAspectRatio = params.aspectRatio;
            if (params.aspectRatio === "Auto" && params.inputImage) {
                try {
                    const dims = await detectImageDimensions(params.inputImage);
                    effectiveAspectRatio = findClosestRatio(dims.width, dims.height);
                } catch {
                    // Detection failed — leave as "Auto"; buildInput handles per-model fallback.
                }
            }

            const resolvedParams = { ...params, aspectRatio: effectiveAspectRatio };
            const size = resolutionToSize(params.resolution, effectiveAspectRatio);
            const input = model.fal.buildInput(resolvedParams, size);

            const payload = JSON.stringify({
                apiKey: this.apiKey,
                modelId: endpoint,
                input,
            });
            assertSafePayloadSize(payload, "Fal.ai request");

            const res = await fetch("/api/fal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                return {
                    success: false,
                    error: data.error || `Fal.ai API error: ${res.status}`,
                    metadata: { duration: performance.now() - start },
                };
            }

            const imageUrl = extractImageUrl(data);
            if (!imageUrl) {
                return {
                    success: false,
                    error: "No image in Fal.ai response",
                    metadata: { duration: performance.now() - start },
                };
            }

            const imageDataUrl = await resolveToDataUrl(imageUrl);

            return {
                success: true,
                imageDataUrl,
                metadata: {
                    duration: performance.now() - start,
                    width: size.width,
                    height: size.height,
                    format: "PNG",
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

/**
 * Fal.ai returns images in a few different shapes across models — unify them.
 */
function extractImageUrl(data: Record<string, unknown>): string | null {
    if (Array.isArray(data.images) && data.images.length > 0) {
        const first = data.images[0] as Record<string, unknown>;
        if (typeof first.url === "string") return first.url;
    }
    if (data.image && typeof data.image === "object") {
        const img = data.image as Record<string, unknown>;
        if (typeof img.url === "string") return img.url;
    }
    if (typeof data.output === "string") return data.output;
    return null;
}

async function resolveToDataUrl(url: string): Promise<string> {
    if (url.startsWith("data:")) return url;
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
