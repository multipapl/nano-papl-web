"use client";

import { useEffect, useState } from "react";
import { RESOLUTIONS, ASPECT_RATIOS, type BatchConfig, type Resolution } from "@/lib/batch/providers/types";
import { PROVIDERS, getModel } from "@/lib/providers/registry";
import { Tooltip } from "@/components/ui/tooltip";
import {
    getProviderSelection,
    setProviderSelection,
    hasApiKeyForProvider,
} from "@/lib/providers/provider-config";
import type { ProviderSlug } from "@/lib/providers/types";

interface BatchConfigPanelProps {
    config: BatchConfig;
    onChange: (config: BatchConfig) => void;
    disabled?: boolean;
}

const OUTPUT_FORMATS = ["PNG", "JPG", "WebP"] as const;

/**
 * Generation settings panel: model, resolution, aspect ratio, output format, gallery toggle.
 * Model selector is filtered to image-to-image-capable models (what Batch actually needs).
 */
export function BatchConfigPanel({ config, onChange, disabled }: BatchConfigPanelProps) {
    const update = <K extends keyof BatchConfig>(key: K, value: BatchConfig[K]) => {
        onChange({ ...config, [key]: value });
    };

    const [activeModelId, setActiveModelId] = useState<string>("");
    const [activeProvider, setActiveProvider] = useState<ProviderSlug>("gemini");
    const [providerKeys, setProviderKeys] = useState<Record<ProviderSlug, boolean>>({
        gemini: false,
        fal: false,
    });
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const sel = getProviderSelection();
            setActiveProvider(sel.provider);
            setActiveModelId(sel.modelId);
            setProviderKeys({
                gemini: hasApiKeyForProvider("gemini"),
                fal: hasApiKeyForProvider("fal"),
            });
            setIsMounted(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const pickModel = (provider: ProviderSlug, modelId: string) => {
        setActiveProvider(provider);
        setActiveModelId(modelId);
        setProviderSelection({ provider, modelId });

        // If the currently-chosen resolution isn't supported by the new model,
        // fall back to the model's first supported tier so we never send an
        // invalid request.
        const model = getModel(modelId);
        const supported = model?.supportedResolutions;
        if (supported && !supported.includes(config.resolution as Resolution)) {
            update("resolution", supported[0]);
        }
    };

    const activeModel = activeModelId ? getModel(activeModelId) : undefined;
    const supportedResolutions: Resolution[] | undefined = activeModel?.supportedResolutions;
    const isResolutionSupported = (r: Resolution) =>
        !supportedResolutions || supportedResolutions.includes(r);

    return (
        <div className="flex flex-col gap-3">
            {/* Model */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Model</label>
                <div className="flex flex-col gap-1">
                    {PROVIDERS.flatMap((provider) =>
                        provider.models
                            .filter((m) => m.capabilities.imageToImage)
                            .map((m) => {
                                const providerHasKey = isMounted ? providerKeys[provider.slug] : false;
                                const isActive = m.id === activeModelId;
                                return (
                                    <Tooltip
                                        key={m.id}
                                        label={providerHasKey ? "Use this image editing model for the whole batch." : `Add a ${provider.name} API key in Settings before using this model.`}
                                        className="w-full"
                                    >
                                        <button
                                            onClick={() => pickModel(provider.slug, m.id)}
                                            disabled={disabled || !providerHasKey}
                                            className={`w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-all duration-200
                                                ${isActive
                                                    ? "bg-accent/20 text-accent border border-accent/30 font-medium"
                                                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-card-hover border border-transparent"}
                                                ${disabled || !providerHasKey ? "opacity-50 cursor-not-allowed" : ""}`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{provider.name}</span>
                                                <span>{m.label}</span>
                                            </span>
                                            {!providerHasKey && (
                                                <span className="text-[9px] text-yellow-500/70">no key</span>
                                            )}
                                        </button>
                                    </Tooltip>
                                );
                            })
                    )}
                </div>
                {isMounted && activeProvider && !providerKeys[activeProvider] && (
                    <p className="text-[10px] text-yellow-500/70 mt-1.5">
                        Add {activeProvider === "gemini" ? "Gemini" : "Fal.ai"} API key in Settings first.
                    </p>
                )}
            </div>

            {/* Resolution */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Resolution</label>
                <div className="flex gap-1">
                    {RESOLUTIONS.map((r) => {
                        const supported = isResolutionSupported(r);
                        const isDisabled = disabled || !supported;
                        return (
                            <Tooltip
                                key={r}
                                label={supported ? `${r} output tier for generated batch images.` : `Not supported by ${activeModel?.label || "this model"}.`}
                                className="flex-1"
                            >
                                <button
                                    onClick={() => update("resolution", r)}
                                    disabled={isDisabled}
                                    title={!supported && activeModel ? `Not supported by ${activeModel.label}` : undefined}
                                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all duration-200
                                        ${config.resolution === r
                                            ? "bg-accent text-white"
                                            : "bg-muted text-muted-foreground hover:text-foreground hover:bg-card-hover"}
                                        ${isDisabled ? "opacity-30 cursor-not-allowed hover:bg-muted hover:text-muted-foreground" : ""}`}
                                >
                                    {r}
                                </button>
                            </Tooltip>
                        );
                    })}
                </div>
            </div>

            {/* Aspect Ratio */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Aspect Ratio</label>
                <div className="flex flex-wrap gap-1">
                    {ASPECT_RATIOS.map((r) => (
                        <Tooltip key={r} label={`Generate batch outputs in ${r} aspect ratio.`}>
                            <button
                                onClick={() => update("aspectRatio", r)}
                                disabled={disabled}
                                className={`px-2.5 py-1 text-[11px] rounded-lg transition-all duration-200
                                    ${config.aspectRatio === r
                                        ? "bg-accent/20 text-accent font-medium"
                                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-card-hover"}
                                    ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                {r}
                            </button>
                        </Tooltip>
                    ))}
                </div>
            </div>

            {/* Output Format */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Output Format</label>
                <div className="flex gap-1">
                    {OUTPUT_FORMATS.map((f) => (
                        <Tooltip key={f} label={`Save generated files as ${f}.`} className="flex-1">
                            <button
                                onClick={() => update("outputFormat", f)}
                                disabled={disabled}
                                className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all duration-200
                                    ${config.outputFormat === f
                                        ? "bg-accent text-white"
                                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-card-hover"}
                                    ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                {f}
                            </button>
                        </Tooltip>
                    ))}
                </div>
            </div>

            {/* Save to Gallery */}
            <Tooltip label="When enabled, every generated batch image is also saved into Gallery.">
                <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
                    <input
                        type="checkbox"
                        checked={config.saveToGallery}
                        onChange={(e) => update("saveToGallery", e.target.checked)}
                        disabled={disabled}
                        className="rounded accent-accent w-3.5 h-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Save results to Gallery</span>
                </label>
            </Tooltip>
        </div>
    );
}
