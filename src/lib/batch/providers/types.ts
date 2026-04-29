/**
 * Pluggable image generation provider interface.
 * Currently implemented by Gemini; designed to support fal.ai, Replicate, etc.
 */

export interface GenerationParams {
    prompt: string;
    inputImage: string; // base64 data URL
    inputImages?: string[]; // optional multi-reference inputs for chat/edit flows
    resolution: string; // "1K" | "2K" | "4K"
    aspectRatio: string; // "16:9" | "1:1" | "Auto" | etc.
    /** Provider-specific extra parameters (e.g. strength, guidance_scale for fal.ai). */
    providerParams?: Record<string, unknown>;
}

export interface GenerationResult {
    success: boolean;
    imageDataUrl?: string; // base64 data URL of generated image
    error?: string;
    metadata?: {
        width?: number;
        height?: number;
        format?: string;
        duration?: number; // ms
    };
}

export interface ImageProvider {
    readonly name: string;

    /**
     * Generate an image from input + prompt.
     * @param params - Generation parameters
     * @param signal - AbortSignal for cancellation
     */
    generate(params: GenerationParams, signal?: AbortSignal): Promise<GenerationResult>;
}

/**
 * A prompt variant produced by the Constructor's season×lighting matrix.
 */
export interface PromptVariant {
    id: string;
    title: string; // e.g. "Winter_Daylight"
    season: string;
    lighting: string;
    prompt: string; // Full assembled prompt text
    hasXmas: boolean;
}

/**
 * Supported image file extensions (lowercase, with dot).
 */
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp",
]);

/**
 * Supported MIME types for images.
 */
export const SUPPORTED_IMAGE_MIMES = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
]);

/**
 * Check if a filename has a supported image extension.
 */
export function isSupportedImageFile(filename: string): boolean {
    const ext = "." + filename.split(".").pop()?.toLowerCase();
    return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
}

/**
 * Available resolutions.
 */
export const RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/**
 * Available aspect ratios.
 */
export const ASPECT_RATIOS = [
    "1:1", "16:9", "9:16", "4:3", "3:4",
    "3:2", "2:3", "5:4", "4:5", "21:9", "Auto",
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/**
 * Batch generation configuration.
 */
export interface BatchConfig {
    resolution: Resolution;
    aspectRatio: string;
    outputFormat: "PNG" | "JPG" | "WebP";
    saveToGallery: boolean;
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
    resolution: "2K",
    aspectRatio: "16:9",
    outputFormat: "PNG",
    saveToGallery: true,
};
