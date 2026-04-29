/**
 * Small browser-side helpers for converting between data URLs and binary blobs.
 */

export function dataUrlToBlob(dataUrl: string): Blob {
    const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
        throw new Error("Invalid data URL");
    }

    const [, mimeType, base64Data] = match;
    const byteCharacters = atob(base64Data);
    const byteArray = new Uint8Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
    }

    return new Blob([byteArray], { type: mimeType });
}

export function getMimeTypeFromDataUrl(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:(.+?);base64,/);
    return match?.[1] ?? null;
}

export function getExtensionForMimeType(mimeType: string): string {
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/bmp") return "bmp";
    return "jpg";
}

export function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
