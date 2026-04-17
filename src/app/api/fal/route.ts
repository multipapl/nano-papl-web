import { NextRequest, NextResponse } from "next/server";
import { SAFE_FUNCTION_PAYLOAD_LIMIT_BYTES } from "@/lib/payload-limits";

/**
 * Fal.ai API proxy route.
 * Keeps API key on the client side (user provides it) but
 * avoids CORS issues by proxying through our Next.js server.
 *
 * POST body:
 *  - apiKey: string (fal.ai key)
 *  - modelId: string (e.g. "fal-ai/flux/dev/image-to-image")
 *  - input: Record<string, unknown> (model-specific input)
 */

const FAL_API_BASE = "https://fal.run";

export async function POST(request: NextRequest) {
    try {
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > SAFE_FUNCTION_PAYLOAD_LIMIT_BYTES) {
            return NextResponse.json(
                { error: "Fal.ai request is too large for Vercel Functions. Reduce the input image size or resolution." },
                { status: 413 },
            );
        }

        const body = await request.json();
        const { apiKey, modelId, input } = body;

        if (!apiKey) {
            return NextResponse.json({ error: "Fal.ai API key is required" }, { status: 400 });
        }

        if (!modelId) {
            return NextResponse.json({ error: "Model ID is required" }, { status: 400 });
        }

        const url = `${FAL_API_BASE}/${modelId}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Key ${apiKey}`,
            },
            body: JSON.stringify(input),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData?.detail || errorData?.message || `Fal.ai API error: ${response.status}` },
                { status: response.status },
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
