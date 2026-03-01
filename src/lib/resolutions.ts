/**
 * Empirically Verified Resolution Table (Truth Table).
 * Ported from core/config/resolutions.py.
 *
 * Defines the valid resolution pairs for specific aspect ratios
 * at different quality tiers (1K, 2K, 4K).
 */

export type ResolutionTier = "1K" | "2K" | "4K";

export interface Dimensions {
    width: number;
    height: number;
}

/**
 * Resolution table: aspectRatio → tier → (width, height).
 */
export const RESOLUTION_TABLE: Record<string, Record<ResolutionTier, Dimensions>> = {
    "1:1":  { "1K": { width: 1024, height: 1024 }, "2K": { width: 2048, height: 2048 }, "4K": { width: 4096, height: 4096 } },
    "16:9": { "1K": { width: 1376, height: 768 },  "2K": { width: 2752, height: 1536 }, "4K": { width: 5504, height: 3072 } },
    "9:16": { "1K": { width: 768,  height: 1376 }, "2K": { width: 1536, height: 2752 }, "4K": { width: 3072, height: 5504 } },
    "4:3":  { "1K": { width: 1200, height: 896 },  "2K": { width: 2400, height: 1792 }, "4K": { width: 4800, height: 3584 } },
    "3:4":  { "1K": { width: 896,  height: 1200 }, "2K": { width: 1792, height: 2400 }, "4K": { width: 3584, height: 4800 } },
    "3:2":  { "1K": { width: 1264, height: 848 },  "2K": { width: 2528, height: 1696 }, "4K": { width: 5056, height: 3392 } },
    "2:3":  { "1K": { width: 848,  height: 1264 }, "2K": { width: 1696, height: 2528 }, "4K": { width: 3392, height: 5056 } },
    "5:4":  { "1K": { width: 1152, height: 928 },  "2K": { width: 2304, height: 1856 }, "4K": { width: 4608, height: 3712 } },
    "4:5":  { "1K": { width: 928,  height: 1152 }, "2K": { width: 1856, height: 2304 }, "4K": { width: 3712, height: 4608 } },
    "21:9": { "1K": { width: 1584, height: 672 },  "2K": { width: 3168, height: 1344 }, "4K": { width: 6336, height: 2688 } },
};

/**
 * All supported aspect ratio labels.
 */
export const SUPPORTED_ASPECT_RATIOS = Object.keys(RESOLUTION_TABLE);

/**
 * Numeric ratio values for each aspect ratio string.
 */
const RATIO_VALUES: Record<string, number> = Object.fromEntries(
    SUPPORTED_ASPECT_RATIOS.map((key) => {
        const [w, h] = key.split(":").map(Number);
        return [key, w / h];
    }),
);

/**
 * Detect the closest matching aspect ratio from the resolution table
 * for a given image width and height.
 */
export function detectClosestAspectRatio(width: number, height: number): string {
    const actual = width / height;
    let bestMatch = "1:1";
    let bestDiff = Infinity;

    for (const [label, ratio] of Object.entries(RATIO_VALUES)) {
        const diff = Math.abs(actual - ratio);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = label;
        }
    }

    return bestMatch;
}

/**
 * Get target dimensions for a given aspect ratio and resolution tier.
 */
export function getTargetDimensions(aspectRatio: string, tier: ResolutionTier): Dimensions | null {
    return RESOLUTION_TABLE[aspectRatio]?.[tier] ?? null;
}

/**
 * Analysis result for a single image.
 */
export interface ImageAnalysis {
    /** Original image dimensions */
    original: Dimensions;
    /** Closest matching aspect ratio from the table */
    detectedRatio: string;
    /** Target dimensions for the detected ratio at the given tier */
    target: Dimensions;
    /** Whether the image already matches the target (exact match) */
    matches: boolean;
    /** Whether resize is needed (image is larger than target) */
    needsResize: boolean;
    /** Unique key derived from the File for identification */
    fileKey: string;
}

/**
 * Analyze an image's dimensions against the resolution table.
 *
 * @param width - Current image width
 * @param height - Current image height
 * @param tier - Resolution tier to check against
 * @param fileKey - Unique identifier for the file
 */
export function analyzeImage(
    width: number,
    height: number,
    tier: ResolutionTier,
    fileKey: string,
): ImageAnalysis {
    const detectedRatio = detectClosestAspectRatio(width, height);
    const target = getTargetDimensions(detectedRatio, tier)!;

    const matches = width === target.width && height === target.height;
    // Needs resize if not matching AND image is larger than target in at least one dimension
    const needsResize = !matches && (width > target.width || height > target.height);

    return {
        original: { width, height },
        detectedRatio,
        target,
        matches,
        needsResize,
        fileKey,
    };
}

/**
 * Read image dimensions from a File object.
 * Returns a promise that resolves to { width, height }.
 */
export function readImageDimensions(file: File): Promise<Dimensions> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to read dimensions for ${file.name}`));
        };
        img.src = url;
    });
}

/**
 * Generate a unique key for a File to use as a map key.
 */
export function fileKey(file: File): string {
    return `${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Analyze all files in batch against the resolution table.
 */
export async function analyzeFiles(
    files: File[],
    tier: ResolutionTier,
): Promise<Map<string, ImageAnalysis>> {
    const results = new Map<string, ImageAnalysis>();

    await Promise.all(
        files.map(async (file) => {
            try {
                const dims = await readImageDimensions(file);
                const key = fileKey(file);
                const analysis = analyzeImage(dims.width, dims.height, tier, key);
                results.set(key, analysis);
            } catch (err) {
                console.warn(`Skipping analysis for ${file.name}:`, err);
            }
        }),
    );

    return results;
}
