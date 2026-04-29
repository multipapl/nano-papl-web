/**
 * Fal.ai client for Chat mode.
 * Thin adapter over FalProvider — keeps Chat's text/imageData response shape
 * while reusing the same endpoint/input logic as Batch.
 */

import { FalProvider } from "@/lib/batch/providers/fal-provider";

export interface FalChatConfig {
    model: string;
    resolution: string;
    ratio: string;
}

export interface FalResponse {
    text: string;
    imageData?: string; // base64 data URL
    error?: string;
}

/**
 * Send an image generation request to Fal.ai via our API proxy.
 * Used by the Chat page when a Fal.ai model is selected.
 */
export async function sendFalMessage(
    apiKey: string,
    userText: string,
    userImagesBase64: string[],
    config: FalChatConfig,
): Promise<FalResponse> {
    if (!userText && userImagesBase64.length === 0) {
        return { text: "", error: "Please provide a prompt or an image." };
    }

    const provider = new FalProvider(apiKey, config.model);
    const result = await provider.generate({
        prompt: userText || "Generate an image",
        inputImage: userImagesBase64[0] || "",
        inputImages: userImagesBase64,
        resolution: config.resolution,
        aspectRatio: config.ratio,
    });

    if (!result.success) {
        return { text: "", error: result.error || "Unknown fal error" };
    }

    return {
        text: result.imageDataUrl ? "Image generated successfully." : "No image was returned.",
        imageData: result.imageDataUrl,
    };
}
