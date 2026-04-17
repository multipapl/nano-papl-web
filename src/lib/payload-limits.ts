/**
 * Vercel Functions reject request bodies above 4.5 MB.
 * Keep a little JSON/header headroom so production fails with a clear app error
 * instead of an opaque FUNCTION_PAYLOAD_TOO_LARGE response.
 */
export const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024;
export const SAFE_FUNCTION_PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

export function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}

export function assertSafePayloadSize(payload: string, label: string): void {
    const bytes = byteLength(payload);
    if (bytes > SAFE_FUNCTION_PAYLOAD_LIMIT_BYTES) {
        const mb = bytes / (1024 * 1024);
        const limitMb = SAFE_FUNCTION_PAYLOAD_LIMIT_BYTES / (1024 * 1024);
        throw new Error(
            `${label} is ${mb.toFixed(1)} MB. Vercel Functions are limited to ${limitMb.toFixed(1)} MB payloads; reduce the input image size or resolution.`,
        );
    }
}
