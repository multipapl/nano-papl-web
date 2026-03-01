"use client";

import { RESOLUTIONS, ASPECT_RATIOS, type BatchConfig } from "@/lib/batch/providers/types";

interface BatchConfigPanelProps {
    config: BatchConfig;
    onChange: (config: BatchConfig) => void;
    disabled?: boolean;
}

const OUTPUT_FORMATS = ["PNG", "JPG", "WebP"] as const;

/**
 * Generation settings panel: resolution, aspect ratio, output format, gallery toggle.
 */
export function BatchConfigPanel({ config, onChange, disabled }: BatchConfigPanelProps) {
    const update = <K extends keyof BatchConfig>(key: K, value: BatchConfig[K]) => {
        onChange({ ...config, [key]: value });
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Resolution */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Resolution</label>
                <div className="flex gap-1">
                    {RESOLUTIONS.map((r) => (
                        <button
                            key={r}
                            onClick={() => update("resolution", r)}
                            disabled={disabled}
                            className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all duration-200
                                ${config.resolution === r
                                    ? "bg-accent text-white"
                                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-card-hover"}
                                ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {/* Aspect Ratio */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Aspect Ratio</label>
                <div className="flex flex-wrap gap-1">
                    {ASPECT_RATIOS.map((r) => (
                        <button
                            key={r}
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
                    ))}
                </div>
            </div>

            {/* Output Format */}
            <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Output Format</label>
                <div className="flex gap-1">
                    {OUTPUT_FORMATS.map((f) => (
                        <button
                            key={f}
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
                    ))}
                </div>
            </div>

            {/* Save to Gallery */}
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
        </div>
    );
}
