/**
 * Shared types for the multi-provider system.
 */

import type { GenerationParams, Resolution } from "@/lib/batch/providers/types";

export type ProviderSlug = "gemini" | "fal";

export interface ImageSize {
    width: number;
    height: number;
}

/**
 * Fal.ai-specific adapter living on each fal model definition.
 * Encapsulates everything the FalProvider needs to talk to this specific model:
 * which endpoint(s) to call and how to build the input payload from normalized params.
 */
export interface FalAdapter {
    /** Base endpoint path on fal.run (e.g. "fal-ai/nano-banana-pro"). */
    endpoint: string;
    /** Optional edit/img2img endpoint. If present, used when inputImage is provided. */
    endpointEdit?: string;
    /** Translate normalized GenerationParams into the model's fal.run input schema. */
    buildInput: (params: GenerationParams, size: ImageSize) => Record<string, unknown>;
}

export interface ModelDefinition {
    id: string;
    label: string;
    provider: ProviderSlug;
    capabilities: {
        textToImage: boolean;
        imageToImage: boolean;
        chat: boolean;
    };
    /** Fal.ai adapter — present for fal models, absent for gemini. */
    fal?: FalAdapter;
    /** Provider-specific default parameters (surfaced as providerParams in UI). */
    defaultParams?: Record<string, unknown>;
    /**
     * Resolutions this model can actually produce. If omitted, all RESOLUTIONS
     * are assumed supported. Used to disable unsupported tiers in the UI.
     */
    supportedResolutions?: Resolution[];
}

export interface ProviderDefinition {
    slug: ProviderSlug;
    name: string;
    models: ModelDefinition[];
}

export interface ProviderSelection {
    provider: ProviderSlug;
    modelId: string;
}
