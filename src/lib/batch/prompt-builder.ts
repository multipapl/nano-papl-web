/**
 * Builds prompt variants from the Constructor state (season × lighting matrix).
 * Each active combination produces one PromptVariant.
 */

import type { PromptVariant } from "./providers/types";

// These types mirror the ConstructorState from app-shell.tsx
// Keeping them here to avoid circular imports; the BatchPage will pass the state in.

export interface LightCellState {
    active: boolean;
    descOverride: string;
    atmosphere: string;
    xmas: boolean;
}

export interface SeasonState {
    active: boolean;
    description: string;
    atmosphere: string;
    lights: Record<string, LightCellState>;
}

export interface ConstructorState {
    projectName: string;
    context: string;
    inputType: string;
    sceneType: string;
    basePrompt: string;
    lightingDefs: Record<string, string>;
    xmasSuffix: string;
    globalRules: string;
    camera: string;
    seasons: Record<string, SeasonState>;
}

/**
 * Build all active prompt variants from a ConstructorState.
 * Returns an array of PromptVariant sorted by season then lighting.
 */
export function buildPromptVariants(state: ConstructorState): PromptVariant[] {
    const variants: PromptVariant[] = [];

    for (const [seasonName, season] of Object.entries(state.seasons)) {
        if (!season.active) continue;

        for (const [lightName, cell] of Object.entries(season.lights)) {
            if (!cell.active) continue;

            // Assemble prompt parts
            const parts: string[] = [];

            // 1. Base prompt (input type + scene type)
            if (state.basePrompt.trim()) {
                parts.push(state.basePrompt.trim());
            }

            // 2. Context / location
            if (state.context.trim()) {
                parts.push(`Context: ${state.context.trim()}`);
            }

            // 3. Season description
            if (season.description.trim()) {
                parts.push(season.description.trim());
            }

            // 4. Season atmosphere
            if (season.atmosphere.trim()) {
                parts.push(season.atmosphere.trim());
            }

            // 5. Lighting — use override if provided, otherwise global definition
            const lightingDesc = cell.descOverride.trim() || state.lightingDefs[lightName]?.trim() || "";
            if (lightingDesc) {
                parts.push(lightingDesc);
            }

            // 6. Cell-specific atmosphere
            if (cell.atmosphere.trim()) {
                parts.push(cell.atmosphere.trim());
            }

            // 7. Christmas suffix
            if (cell.xmas && state.xmasSuffix.trim()) {
                parts.push(state.xmasSuffix.trim());
            }

            // 8. Global rules
            if (state.globalRules.trim()) {
                parts.push(state.globalRules.trim());
            }

            // 9. Camera
            if (state.camera.trim()) {
                parts.push(state.camera.trim());
            }

            const prompt = parts.join(" ");
            const title = `${seasonName}_${lightName.replace(/\s+/g, "-")}${cell.xmas ? "_Xmas" : ""}`;

            variants.push({
                id: `${seasonName}-${lightName}-${cell.xmas ? "xmas" : "std"}`,
                title,
                season: seasonName,
                lighting: lightName,
                prompt,
                hasXmas: cell.xmas,
            });
        }
    }

    return variants;
}

/**
 * Count total active variants without building full prompts.
 */
export function countActiveVariants(state: ConstructorState): number {
    let count = 0;
    for (const season of Object.values(state.seasons)) {
        if (!season.active) continue;
        for (const cell of Object.values(season.lights)) {
            if (cell.active) count++;
        }
    }
    return count;
}
