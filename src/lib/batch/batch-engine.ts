/**
 * Core batch processing engine.
 * Uses an async generator pattern to yield events as tasks are processed.
 * The consumer (React component) handles UI updates per event.
 */

import type { ImageProvider, PromptVariant, BatchConfig, GenerationResult } from "./providers/types";
import { fileToBase64 } from "../gemini";

// ─── Event types ───

export interface BatchTaskInfo {
    taskIndex: number;
    totalTasks: number;
    imageFile: File;
    promptVariant: PromptVariant;
}

export type BatchEvent =
    | { type: "batch-start"; totalTasks: number; totalImages: number; totalPrompts: number }
    | { type: "task-start"; task: BatchTaskInfo }
    | { type: "task-complete"; task: BatchTaskInfo; result: GenerationResult; duration: number }
    | { type: "task-error"; task: BatchTaskInfo; error: string; duration: number }
    | { type: "batch-complete"; stats: BatchStats }
    | { type: "batch-stopped"; stats: BatchStats }
    | { type: "log"; message: string };

export interface BatchStats {
    total: number;
    completed: number;
    failed: number;
    totalDuration: number; // ms
    avgDuration: number;   // ms per task
}

// ─── Engine ───

/**
 * Run a batch generation process.
 * Yields events for each step; the caller consumes them to update UI.
 *
 * @param images - Array of image Files to process
 * @param prompts - Array of PromptVariants from the Constructor
 * @param provider - The image generation provider (e.g. GeminiProvider)
 * @param config - Batch configuration (resolution, ratio, format)
 * @param signal - AbortSignal for cancellation
 */
export async function* runBatch(
    images: File[],
    prompts: PromptVariant[],
    provider: ImageProvider,
    config: BatchConfig,
    signal: AbortSignal,
): AsyncGenerator<BatchEvent> {
    const totalTasks = images.length * prompts.length;

    yield {
        type: "batch-start",
        totalTasks,
        totalImages: images.length,
        totalPrompts: prompts.length,
    };

    if (totalTasks === 0) {
        yield { type: "log", message: "Nothing to process — no images or no active prompts." };
        yield {
            type: "batch-complete",
            stats: { total: 0, completed: 0, failed: 0, totalDuration: 0, avgDuration: 0 },
        };
        return;
    }

    yield { type: "log", message: `--- BATCH START: ${images.length} images × ${prompts.length} prompts = ${totalTasks} tasks ---` };

    const durations: number[] = [];
    let completed = 0;
    let failed = 0;
    let taskIndex = 0;
    const batchStart = performance.now();

    for (const imageFile of images) {
        // Convert image to base64 once per image (reuse across prompts)
        let imageBase64: string;
        try {
            imageBase64 = await fileToBase64(imageFile);
        } catch {
            yield { type: "log", message: `[ERROR] Failed to read file: ${imageFile.name}` };
            // Skip all prompts for this image
            for (const prompt of prompts) {
                taskIndex++;
                failed++;
                yield {
                    type: "task-error",
                    task: { taskIndex, totalTasks, imageFile, promptVariant: prompt },
                    error: `Failed to read file: ${imageFile.name}`,
                    duration: 0,
                };
            }
            continue;
        }

        for (const prompt of prompts) {
            if (signal.aborted) {
                const stats = buildStats(taskIndex, completed, failed, durations, batchStart);
                yield { type: "batch-stopped", stats };
                return;
            }

            taskIndex++;
            const taskInfo: BatchTaskInfo = { taskIndex, totalTasks, imageFile, promptVariant: prompt };

            yield { type: "task-start", task: taskInfo };
            yield { type: "log", message: `[${taskIndex}/${totalTasks}] ${imageFile.name} → ${prompt.title}` };

            const taskStart = performance.now();

            try {
                const result = await provider.generate(
                    {
                        prompt: prompt.prompt,
                        inputImage: imageBase64,
                        resolution: config.resolution,
                        aspectRatio: config.aspectRatio,
                    },
                    signal,
                );

                const duration = performance.now() - taskStart;
                durations.push(duration);

                if (result.success) {
                    completed++;
                    yield { type: "task-complete", task: taskInfo, result, duration };
                    yield { type: "log", message: `  [OK] Generated in ${(duration / 1000).toFixed(1)}s` };
                } else {
                    failed++;
                    yield { type: "task-error", task: taskInfo, error: result.error || "Unknown error", duration };
                    yield { type: "log", message: `  [ERROR] ${result.error}` };
                }
            } catch (err: unknown) {
                const duration = performance.now() - taskStart;
                durations.push(duration);
                failed++;

                if (err instanceof DOMException && err.name === "AbortError") {
                    const stats = buildStats(taskIndex, completed, failed, durations, batchStart);
                    yield { type: "log", message: "--- BATCH STOPPED BY USER ---" };
                    yield { type: "batch-stopped", stats };
                    return;
                }

                const message = err instanceof Error ? err.message : "Unknown error";
                yield { type: "task-error", task: taskInfo, error: message, duration };
                yield { type: "log", message: `  [ERROR] ${message}` };
            }
        }
    }

    const stats = buildStats(totalTasks, completed, failed, durations, batchStart);
    yield { type: "log", message: `--- BATCH COMPLETE: ${completed} OK, ${failed} failed, ${(stats.totalDuration / 1000).toFixed(1)}s total ---` };
    yield { type: "batch-complete", stats };
}

function buildStats(
    total: number,
    completed: number,
    failed: number,
    durations: number[],
    batchStart: number,
): BatchStats {
    const totalDuration = performance.now() - batchStart;
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return { total, completed, failed, totalDuration, avgDuration };
}

/**
 * Calculate ETA string from progress stats.
 */
export function formatETA(completedTasks: number, totalTasks: number, avgDurationMs: number): string {
    if (completedTasks === 0 || totalTasks === 0) return "Calculating...";
    const remaining = totalTasks - completedTasks;
    const etaMs = remaining * avgDurationMs;
    const etaS = Math.round(etaMs / 1000);

    if (etaS < 60) return `${etaS}s`;
    if (etaS < 3600) {
        const m = Math.floor(etaS / 60);
        const s = etaS % 60;
        return `${m}m ${s}s`;
    }
    const h = Math.floor(etaS / 3600);
    const m = Math.floor((etaS % 3600) / 60);
    return `${h}h ${m}m`;
}
