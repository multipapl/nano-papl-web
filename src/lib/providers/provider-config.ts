/**
 * Provider configuration utilities.
 * Reads/writes the active provider + model selection from localStorage.
 */

import { storage } from "@/lib/storage";
import { PROVIDERS, DEFAULT_PROVIDER, DEFAULT_MODEL_ID, getModel, getProvider } from "./registry";
import type { ProviderSlug, ProviderSelection, ModelDefinition } from "./types";

/**
 * Get the current provider selection from localStorage.
 * Falls back to Gemini defaults if nothing is saved.
 */
export function getProviderSelection(): ProviderSelection {
    const provider = storage.getActiveProvider() as ProviderSlug;
    const modelId = storage.getActiveModel();

    // Validate that the model belongs to the provider
    const model = getModel(modelId);
    if (model && model.provider === provider) {
        return { provider, modelId };
    }

    // Fallback: use first model of selected provider, or absolute defaults
    const providerDef = getProvider(provider);
    if (providerDef && providerDef.models.length > 0) {
        return { provider, modelId: providerDef.models[0].id };
    }

    return { provider: DEFAULT_PROVIDER, modelId: DEFAULT_MODEL_ID };
}

/**
 * Save provider selection to localStorage.
 */
export function setProviderSelection(selection: ProviderSelection): void {
    storage.setActiveProvider(selection.provider);
    storage.setActiveModel(selection.modelId);
}

/**
 * Get the API key for a given provider.
 */
export function getApiKeyForProvider(slug: ProviderSlug): string {
    switch (slug) {
        case "gemini":
            return storage.getGeminiKey();
        case "fal":
            return storage.getFalKey();
        default:
            return "";
    }
}

/**
 * Check if a provider has a valid API key configured.
 */
export function hasApiKeyForProvider(slug: ProviderSlug): boolean {
    return getApiKeyForProvider(slug).length > 0;
}

/**
 * Get the currently selected model definition.
 */
export function getActiveModel(): ModelDefinition | undefined {
    const { modelId } = getProviderSelection();
    return getModel(modelId);
}

export { PROVIDERS, getProvider, getModel, DEFAULT_PROVIDER, DEFAULT_MODEL_ID };
