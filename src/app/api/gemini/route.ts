import { NextRequest, NextResponse } from "next/server";

/**
 * Gemini API proxy route.
 * Keeps API key on the client side (user provides it) but
 * avoids CORS issues by proxying through our Next.js server.
 *
 * POST body:
 *  - apiKey: string
 *  - modelId: string (e.g. "gemini-2.0-flash-exp")
 *  - contents: array of { role, parts }
 *  - systemInstruction?: string
 *  - responseModalities: string[] (e.g. ["TEXT"] or ["TEXT", "IMAGE"])
 *  - imageConfig?: { imageSize?: string, aspectRatio?: string }
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { apiKey, modelId, contents, systemInstruction, responseModalities, imageConfig } = body;

        if (!apiKey) {
            return NextResponse.json({ error: "API key is required" }, { status: 400 });
        }

        // Build generation config
        const generationConfig: Record<string, unknown> = {
            temperature: 0.7,
        };

        if (responseModalities?.length) {
            generationConfig.responseModalities = responseModalities;
        }

        if (imageConfig) {
            generationConfig.imageConfig = imageConfig;
        }

        // Build request body
        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig,
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }],
            };
        }

        const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData?.error?.message || `Gemini API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
