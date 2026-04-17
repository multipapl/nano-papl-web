/**
 * Client-side image resizing using the Canvas API.
 * Ports the proportional scaling logic from core/services/image_resizer_service.py.
 */

import {
    type Dimensions,
    type ImageAnalysis,
    readImageDimensions,
    fileKey,
} from "./resolutions";

/**
 * Calculate proportional size that fits within target while maintaining aspect ratio.
 * Same algorithm as ImageResizerService.calculate_proportional_size.
 */
export function calculateProportionalSize(
    originalWidth: number,
    originalHeight: number,
    targetWidth: number,
    targetHeight: number,
): Dimensions {
    const widthRatio = targetWidth / originalWidth;
    const heightRatio = targetHeight / originalHeight;
    const scalingRatio = Math.min(widthRatio, heightRatio);

    // Don't upscale
    if (scalingRatio >= 1.0) {
        return { width: originalWidth, height: originalHeight };
    }

    return {
        width: Math.round(originalWidth * scalingRatio),
        height: Math.round(originalHeight * scalingRatio),
    };
}

/**
 * Determine the output MIME type from a File.
 */
function getOutputMime(file: File): string {
    if (file.type === "image/png") return "image/png";
    if (file.type === "image/webp") return "image/webp";
    // Default to JPEG for everything else
    return "image/jpeg";
}

/**
 * Determine the file extension from MIME type.
 */
function getExtension(mime: string): string {
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    return ".jpg";
}

/**
 * Resize a single image file to fit within the target dimensions.
 *
 * @param file - The original image File
 * @param targetWidth - Target width in pixels
 * @param targetHeight - Target height in pixels
 * @returns A new File containing the resized image
 */
export async function resizeImageFile(
    file: File,
    targetWidth: number,
    targetHeight: number,
): Promise<File> {
    const dims = await readImageDimensions(file);
    const newSize = calculateProportionalSize(
        dims.width,
        dims.height,
        targetWidth,
        targetHeight,
    );

    // If no resize needed, return original
    if (newSize.width === dims.width && newSize.height === dims.height) {
        return file;
    }

    // Load image into an ImageBitmap for drawing
    const bitmap = await createImageBitmap(file);
    const mime = getOutputMime(file);
    const quality = mime === "image/png" ? undefined : 0.95;

    // Use OffscreenCanvas if available, else fall back to regular canvas
    let blob: Blob;

    if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(newSize.width, newSize.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0, newSize.width, newSize.height);
        blob = await canvas.convertToBlob({ type: mime, quality });
    } else {
        const canvas = document.createElement("canvas");
        canvas.width = newSize.width;
        canvas.height = newSize.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0, newSize.width, newSize.height);
        blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
                mime,
                quality,
            );
        });
    }

    bitmap.close();

    // Build output filename
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const ext = getExtension(mime);
    const outputName = `${baseName}_optimized${ext}`;

    return new File([blob], outputName, { type: mime, lastModified: Date.now() });
}

/**
 * Progress callback type for batch resize operations.
 */
export interface ResizeProgress {
    current: number;
    total: number;
    fileName: string;
}

/**
 * Resize all files that need optimization according to their analysis.
 * Returns a new array of Files where non-matching images are replaced with resized versions.
 *
 * @param files - Original file array
 * @param analysisMap - Analysis results from analyzeFiles()
 * @param onProgress - Optional progress callback
 * @returns Object with optimized files array and a map of original→resized for download
 */
export async function resizeAll(
    files: File[],
    analysisMap: Map<string, ImageAnalysis>,
    onProgress?: (progress: ResizeProgress) => void,
): Promise<{ optimizedFiles: File[]; resizedMap: Map<string, File> }> {
    const optimizedFiles: File[] = [];
    const resizedMap = new Map<string, File>();

    const filesToProcess = files.filter((f) => {
        const key = fileKey(f);
        const analysis = analysisMap.get(key);
        return analysis && !analysis.matches;
    });

    let current = 0;
    const total = filesToProcess.length;

    for (const file of files) {
        const key = fileKey(file);
        const analysis = analysisMap.get(key);

        if (analysis && !analysis.matches) {
            current++;
            onProgress?.({ current, total, fileName: file.name });

            try {
                const resized = await resizeImageFile(
                    file,
                    analysis.target.width,
                    analysis.target.height,
                );
                optimizedFiles.push(resized);
                resizedMap.set(key, resized);
            } catch (err) {
                console.warn(`Failed to resize ${file.name}:`, err);
                optimizedFiles.push(file); // Keep original on failure
            }
        } else {
            optimizedFiles.push(file); // Already matching
        }
    }

    return { optimizedFiles, resizedMap };
}

/**
 * Download a single file to disk.
 */
export function downloadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Download multiple files to disk.
 * Downloads them individually (zip would require a library dependency).
 */
export function downloadFiles(files: File[]): void {
    for (const file of files) {
        downloadFile(file);
    }
}
