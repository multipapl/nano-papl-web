"use client";

import { useState, useCallback } from "react";
import { X, Check, AlertTriangle, Zap, Download, Loader2 } from "lucide-react";
import type { ImageAnalysis, ResolutionTier } from "@/lib/resolutions";
import { fileKey } from "@/lib/resolutions";
import { resizeAll, downloadFiles, type ResizeProgress } from "@/lib/image-resizer";

interface ImageOptimizerPanelProps {
    files: File[];
    analysisMap: Map<string, ImageAnalysis>;
    tier: ResolutionTier;
    onOptimized: (files: File[]) => void;
    onClose: () => void;
}

/**
 * Overlay panel showing per-image resolution analysis with optimize and save actions.
 */
export function ImageOptimizerPanel({
    files,
    analysisMap,
    tier,
    onOptimized,
    onClose,
}: ImageOptimizerPanelProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState<ResizeProgress | null>(null);
    const [lastResized, setLastResized] = useState<Map<string, File> | null>(null);
    const [isDone, setIsDone] = useState(false);

    const needsOptimization = files.filter((f) => {
        const a = analysisMap.get(fileKey(f));
        return a && !a.matches;
    });

    const matchCount = files.length - needsOptimization.length;

    const handleOptimize = useCallback(async () => {
        setIsProcessing(true);
        setProgress(null);
        setIsDone(false);

        try {
            const { optimizedFiles, resizedMap } = await resizeAll(
                files,
                analysisMap,
                (p) => setProgress(p),
            );

            setLastResized(resizedMap);
            onOptimized(optimizedFiles);
            setIsDone(true);
        } catch (err) {
            console.error("Optimization failed:", err);
        } finally {
            setIsProcessing(false);
        }
    }, [files, analysisMap, onOptimized]);

    const handleSaveToDisk = useCallback(() => {
        if (lastResized && lastResized.size > 0) {
            downloadFiles(Array.from(lastResized.values()));
        }
    }, [lastResized]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <div>
                    <h2 className="text-sm font-semibold">Image Optimizer</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        Resolution tier: <span className="text-accent font-medium">{tier}</span>
                        {" · "}
                        <span className="text-green-400">{matchCount} ok</span>
                        {needsOptimization.length > 0 && (
                            <> · <span className="text-yellow-400">{needsOptimization.length} need resize</span></>
                        )}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Image table */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            <th className="text-left py-2 font-medium">File</th>
                            <th className="text-center py-2 font-medium">Current</th>
                            <th className="text-center py-2 font-medium">Ratio</th>
                            <th className="text-center py-2 font-medium">Target</th>
                            <th className="text-center py-2 font-medium w-16">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((file, i) => {
                            const key = fileKey(file);
                            const analysis = analysisMap.get(key);

                            return (
                                <tr
                                    key={`${key}-${i}`}
                                    className="border-t border-border/50 hover:bg-muted/30 transition-colors"
                                >
                                    <td className="py-2 pr-3 max-w-[180px]">
                                        <span className="truncate block" title={file.name}>
                                            {file.name}
                                        </span>
                                    </td>
                                    <td className="py-2 text-center text-muted-foreground">
                                        {analysis
                                            ? `${analysis.original.width}×${analysis.original.height}`
                                            : "…"}
                                    </td>
                                    <td className="py-2 text-center text-muted-foreground">
                                        {analysis?.detectedRatio ?? "…"}
                                    </td>
                                    <td className="py-2 text-center text-muted-foreground">
                                        {analysis
                                            ? `${analysis.target.width}×${analysis.target.height}`
                                            : "…"}
                                    </td>
                                    <td className="py-2 text-center">
                                        {analysis ? (
                                            analysis.matches ? (
                                                <span className="inline-flex items-center gap-1 text-green-400">
                                                    <Check size={12} /> OK
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-yellow-400">
                                                    <AlertTriangle size={12} /> Resize
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-muted-foreground/40">…</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {files.length === 0 && (
                    <div className="text-center text-muted-foreground/40 py-12 text-sm">
                        No images loaded
                    </div>
                )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-border shrink-0 flex items-center gap-3">
                {/* Progress indicator */}
                {isProcessing && progress && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Loader2 size={14} className="animate-spin text-accent shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                            {progress.current}/{progress.total} — {progress.fileName}
                        </span>
                    </div>
                )}

                {/* Done message */}
                {isDone && !isProcessing && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Check size={14} className="text-green-400 shrink-0" />
                        <span className="text-xs text-green-400">
                            Optimization complete. Images updated in batch.
                        </span>
                    </div>
                )}

                {/* Spacer when no status */}
                {!isProcessing && !isDone && <div className="flex-1" />}

                {/* Save to disk */}
                {isDone && lastResized && lastResized.size > 0 && (
                    <button
                        onClick={handleSaveToDisk}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-card-hover text-muted-foreground hover:text-foreground transition-all duration-200"
                    >
                        <Download size={12} />
                        Save to Disk ({lastResized.size})
                    </button>
                )}

                {/* Optimize button */}
                <button
                    onClick={handleOptimize}
                    disabled={isProcessing || needsOptimization.length === 0}
                    className={`flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-medium transition-all duration-200
                        ${needsOptimization.length === 0
                            ? "bg-green-500/20 text-green-400 cursor-default"
                            : isProcessing
                                ? "bg-accent/20 text-accent/60 cursor-wait"
                                : "bg-accent text-white hover:bg-accent/90 active:scale-[0.97]"
                        }`}
                >
                    {isProcessing ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : needsOptimization.length === 0 ? (
                        <Check size={12} />
                    ) : (
                        <Zap size={12} />
                    )}
                    {needsOptimization.length === 0
                        ? "All images OK"
                        : isProcessing
                            ? "Optimizing…"
                            : `Optimize ${needsOptimization.length} image${needsOptimization.length !== 1 ? "s" : ""}`}
                </button>
            </div>
        </div>
    );
}
