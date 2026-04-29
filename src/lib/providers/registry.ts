/**
 * Central provider & model registry.
 * All available providers and their models are defined here.
 *
 * Each fal model carries its own adapter (endpoint + buildInput) so that
 * adding a new model is a single registry entry — no changes to FalProvider.
 */

import type { GenerationParams } from "@/lib/batch/providers/types";
import type { ProviderDefinition, ProviderSlug, ModelDefinition, ImageSize } from "./types";

/** Fal.ai uses lowercase "auto"; our UI uses "Auto". */
function normalizeAspect(aspectRatio: string): string | undefined {
    if (!aspectRatio) return undefined;
    return aspectRatio === "Auto" ? "auto" : aspectRatio;
}

function getInputImages(params: GenerationParams): string[] {
    if (params.inputImages?.length) {
        return params.inputImages;
    }
    return params.inputImage ? [params.inputImage] : [];
}

// ─── Provider definitions ───

export const PROVIDERS: ProviderDefinition[] = [
    {
        slug: "gemini",
        name: "Google Gemini",
        models: [
            {
                id: "gemini-3-pro-image-preview",
                label: "Gemini 3 Pro (Image)",
                provider: "gemini",
                capabilities: { textToImage: true, imageToImage: true, chat: true },
            },
            {
                id: "gemini-3-flash-preview",
                label: "Gemini 3 Flash",
                provider: "gemini",
                capabilities: { textToImage: false, imageToImage: false, chat: true },
            },
        ],
    },
    {
        slug: "fal",
        name: "Fal.ai",
        models: [
            {
                // Cheapest option — great for smoke-testing the pipeline (~$0.003/MP).
                // Text-to-image only; does not accept input images.
                id: "fal-ai/flux/schnell",
                label: "FLUX.1 Schnell (cheap)",
                provider: "fal",
                capabilities: { textToImage: true, imageToImage: false, chat: false },
                // Trained on ~1MP. Max safe image_size ~1024 on long side —
                // 2K/4K would exceed model sweet spot and cause artefacts/API errors.
                supportedResolutions: ["1K"],
                fal: {
                    endpoint: "fal-ai/flux/schnell",
                    buildInput: (params: GenerationParams, size: ImageSize) => ({
                        prompt: params.prompt,
                        image_size: { width: size.width, height: size.height },
                        num_inference_steps: (params.providerParams?.num_inference_steps as number) ?? 4,
                        num_images: 1,
                        enable_safety_checker: true,
                    }),
                },
            },
            {
                // Mid-tier — supports both txt2img (base) and img2img (/edit).
                // ~$0.012/MP, multi-reference editing up to several input images.
                id: "fal-ai/flux-2",
                label: "FLUX.2 Dev",
                provider: "fal",
                capabilities: { textToImage: true, imageToImage: true, chat: false },
                // Trained on ~1-2MP. 2K (~2MP) is the practical upper bound;
                // 4K exceeds model capability — API ignores image_size when
                // aspect_ratio is set and returns its own default instead.
                supportedResolutions: ["1K", "2K"],
                fal: {
                    endpoint: "fal-ai/flux-2",
                    endpointEdit: "fal-ai/flux-2/edit",
                    buildInput: (params: GenerationParams, size: ImageSize) => {
                        const input: Record<string, unknown> = {
                            prompt: params.prompt,
                            num_images: 1,
                        };
                        const ratio = normalizeAspect(params.aspectRatio);
                        if (ratio && ratio !== "auto") {
                            input.aspect_ratio = ratio;
                        } else {
                            input.image_size = { width: size.width, height: size.height };
                        }
                        const inputImages = getInputImages(params);
                        if (inputImages.length > 0) {
                            input.image_urls = inputImages;
                        }
                        if (params.providerParams?.seed != null) {
                            input.seed = params.providerParams.seed;
                        }
                        return input;
                    },
                },
            },
            {
                // Google's Nano Banana Pro via Fal.ai — premium quality ($0.15/img @ 2K, $0.30 @ 4K).
                // Single multimodal model: same registry entry handles txt2img and img2img
                // (FalProvider picks endpoint based on whether inputImage is present).
                id: "fal-ai/nano-banana-pro",
                label: "Nano Banana Pro",
                provider: "fal",
                capabilities: { textToImage: true, imageToImage: true, chat: false },
                // Natively supports 1K/2K/4K via the `resolution` string param.
                supportedResolutions: ["1K", "2K", "4K"],
                fal: {
                    endpoint: "fal-ai/nano-banana-pro",
                    endpointEdit: "fal-ai/nano-banana-pro/edit",
                    buildInput: (params: GenerationParams) => {
                        const input: Record<string, unknown> = {
                            prompt: params.prompt,
                            num_images: 1,
                            resolution: params.resolution, // "1K" | "2K" | "4K" — passes through
                        };
                        const ratio = normalizeAspect(params.aspectRatio);
                        if (ratio) {
                            input.aspect_ratio = ratio;
                        }
                        const inputImages = getInputImages(params);
                        if (inputImages.length > 0) {
                            input.image_urls = inputImages;
                        }
                        return input;
                    },
                },
            },
        ],
    },
];

// ─── Lookup helpers ───

export const DEFAULT_PROVIDER: ProviderSlug = "gemini";
export const DEFAULT_MODEL_ID = "gemini-3-pro-image-preview";

/** Get a provider definition by slug. */
export function getProvider(slug: ProviderSlug): ProviderDefinition | undefined {
    return PROVIDERS.find((p) => p.slug === slug);
}

/** Get a model definition by its id (searches across all providers). */
export function getModel(modelId: string): ModelDefinition | undefined {
    for (const provider of PROVIDERS) {
        const model = provider.models.find((m) => m.id === modelId);
        if (model) return model;
    }
    return undefined;
}

/** Human-readable model label, falling back to the raw id for unknown models. */
export function getModelLabel(modelId: string): string {
    return getModel(modelId)?.label ?? modelId;
}

/** Filesystem-friendly model tag for generated image names. */
export function getModelNameTag(modelId: string): string {
    return getModelLabel(modelId)
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/** Append model information to a generated image/gallery name. */
export function withModelName(name: string, modelId: string): string {
    const tag = getModelNameTag(modelId);
    return tag ? `${name}_${tag}` : name;
}

/** Get all models for a given provider. */
export function getModelsForProvider(slug: ProviderSlug): ModelDefinition[] {
    return getProvider(slug)?.models ?? [];
}

/** Get all models with image-to-image capability (used by Batch mode). */
export function getImageToImageModels(): ModelDefinition[] {
    return PROVIDERS.flatMap((p) => p.models.filter((m) => m.capabilities.imageToImage));
}

/** Get all models with chat capability. */
export function getChatModels(): ModelDefinition[] {
    return PROVIDERS.flatMap((p) => p.models.filter((m) => m.capabilities.chat));
}
