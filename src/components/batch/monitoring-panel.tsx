"use client";

import { useRef, useEffect } from "react";
import { Play, Square, RotateCcw, Loader2 } from "lucide-react";
import { ImageCompare } from "./image-compare";

export type BatchStatus = "idle" | "running" | "paused" | "completed" | "stopped";

interface MonitoringPanelProps {
    status: BatchStatus;
    logs: string[];
    progress: number; // 0-100
    completedCount: number;
    totalCount: number;
    eta: string;
    currentPrompt: string;
    inputPreview: string | null;
    outputPreview: string | null;
    failedCount: number;
    onStart: () => void;
    onStop: () => void;
    onRetryFailed?: () => void;
    onImageClick?: (src: string) => void;
}

/**
 * Live monitoring panel with preview, log, progress, and controls.
 */
export function MonitoringPanel({
    status,
    logs,
    progress,
    completedCount,
    totalCount,
    eta,
    currentPrompt,
    inputPreview,
    outputPreview,
    failedCount,
    onStart,
    onStop,
    onRetryFailed,
    onImageClick,
}: MonitoringPanelProps) {
    const logRef = useRef<HTMLDivElement>(null);

    // Auto-scroll log
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    const isRunning = status === "running";
    const isIdle = status === "idle";
    const isDone = status === "completed" || status === "stopped";

    return (
        <div className="flex flex-col gap-3 h-full min-h-0">
            {/* Preview area — allows shrinking on small viewports */}
            <div className="bg-card border border-border rounded-xl p-4 min-h-0 shrink">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Live Preview</h3>
                <ImageCompare
                    inputSrc={inputPreview}
                    outputSrc={outputPreview}
                    onImageClick={onImageClick}
                />
            </div>

            {/* Current prompt — separate card */}
            {currentPrompt && (
                <div className="bg-card border border-border rounded-xl px-4 py-2.5 shrink-0">
                    <p className="text-[10px] text-muted-foreground/60 mb-1">Current Prompt</p>
                    <div className="bg-muted rounded-lg px-3 py-1.5 max-h-12 overflow-y-auto">
                        <p className="text-[11px] text-foreground/80 leading-relaxed">{currentPrompt}</p>
                    </div>
                </div>
            )}

            {/* Status & Controls — fills remaining space */}
            <div className="bg-card border border-border rounded-xl p-4 flex-1 min-h-[220px] flex flex-col">
                {/* Log area — flexes to fill available space */}
                <div
                    ref={logRef}
                    className="flex-1 min-h-[60px] overflow-y-auto bg-muted rounded-lg px-3 py-2 mb-3 font-mono text-[11px] text-foreground/70 leading-relaxed"
                >
                    {logs.length === 0 ? (
                        <span className="text-muted-foreground/30 italic">Waiting to start...</span>
                    ) : (
                        logs.map((line, i) => (
                            <div key={i} className={`${line.includes("[ERROR]") ? "text-red-400" : line.includes("[OK]") ? "text-green-400" : ""}`}>
                                {line}
                            </div>
                        ))
                    )}
                </div>

                {/* Progress */}
                <div className="shrink-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Progress</span>
                        <span>{completedCount + failedCount} / {totalCount}</span>
                    </div>
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden mb-1">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ease-out ${failedCount > 0 && isDone ? "bg-yellow-500" : "bg-accent"}`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted-foreground/40">
                            ETA: {isRunning ? eta : isDone ? "Done" : "—"}
                        </p>
                        {failedCount > 0 && (
                            <p className="text-[10px] text-red-400">{failedCount} failed</p>
                        )}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2">
                        {isIdle ? (
                            <button
                                onClick={onStart}
                                className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-all duration-200 active:scale-[0.98]"
                            >
                                <Play size={16} /> START BATCH
                            </button>
                        ) : isRunning ? (
                            <>
                                <button
                                    onClick={onStop}
                                    className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/20 text-red-400 font-medium text-sm hover:bg-red-500/30 transition-all duration-200 active:scale-[0.98]"
                                >
                                    <Square size={16} /> STOP
                                </button>
                                <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm">
                                    <Loader2 size={14} className="animate-spin" /> Running...
                                </div>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={onStart}
                                    className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-all duration-200 active:scale-[0.98]"
                                >
                                    <Play size={16} /> NEW BATCH
                                </button>
                                {failedCount > 0 && onRetryFailed && (
                                    <button
                                        onClick={onRetryFailed}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500/20 text-yellow-400 font-medium text-sm hover:bg-yellow-500/30 transition-all duration-200 active:scale-[0.98]"
                                    >
                                        <RotateCcw size={14} /> Retry
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Batch summary */}
                    {isDone && totalCount > 0 && (
                        <div className="mt-2.5 p-2.5 bg-muted rounded-lg">
                            <p className="text-[10px] text-muted-foreground">
                                {status === "completed" ? "✓ Batch completed" : "⊘ Batch stopped"} — {completedCount} generated, {failedCount} failed
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
