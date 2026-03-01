"use client";

import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Layers, SlidersHorizontal, ChevronDown, X, Download, Zap } from "lucide-react";
import { ImageDropZone } from "./image-drop-zone";
import { BatchConfigPanel } from "./batch-config";
import { MonitoringPanel, type BatchStatus } from "./monitoring-panel";
import { ConstructorPanel, createDefaultConstructorState } from "./constructor-panel";
import { buildPromptVariants, countActiveVariants, type ConstructorState } from "@/lib/batch/prompt-builder";
import { runBatch, formatETA, type BatchEvent } from "@/lib/batch/batch-engine";
import { GeminiProvider } from "@/lib/batch/providers/gemini-provider";
import { DEFAULT_BATCH_CONFIG, type BatchConfig } from "@/lib/batch/providers/types";
import { storage } from "@/lib/storage";
import { saveGalleryItem } from "@/lib/image-db";
import { ImageOptimizerPanel } from "./image-optimizer-panel";
import { type ImageAnalysis, type ResolutionTier, analyzeFiles } from "@/lib/resolutions";

// ─── State ───

interface BatchState {
    status: BatchStatus;
    files: File[];
    config: BatchConfig;
    constructorState: ConstructorState;
    constructorOpen: boolean;
    logs: string[];
    progress: number;
    completedCount: number;
    failedCount: number;
    totalCount: number;
    eta: string;
    currentPrompt: string;
    inputPreview: string | null;
    outputPreview: string | null;
    avgDuration: number;
    lightboxSrc: string | null;
    imageAnalysis: Map<string, ImageAnalysis>;
    optimizerOpen: boolean;
}

type BatchAction =
    | { type: "SET_FILES"; files: File[] }
    | { type: "SET_CONFIG"; config: BatchConfig }
    | { type: "SET_CONSTRUCTOR"; state: ConstructorState }
    | { type: "TOGGLE_CONSTRUCTOR"; open: boolean }
    | { type: "BATCH_START"; totalCount: number }
    | { type: "TASK_START"; prompt: string; inputPreview: string | null }
    | { type: "TASK_COMPLETE"; outputPreview: string | null; duration: number }
    | { type: "TASK_ERROR"; duration: number }
    | { type: "LOG"; message: string }
    | { type: "BATCH_DONE"; status: "completed" | "stopped" }
    | { type: "RESET" }
    | { type: "SET_LIGHTBOX"; src: string | null }
    | { type: "SET_IMAGE_ANALYSIS"; analysis: Map<string, ImageAnalysis> }
    | { type: "TOGGLE_OPTIMIZER"; open: boolean };

function batchReducer(state: BatchState, action: BatchAction): BatchState {
    switch (action.type) {
        case "SET_FILES":
            return { ...state, files: action.files };
        case "SET_CONFIG":
            return { ...state, config: action.config };
        case "SET_CONSTRUCTOR":
            return { ...state, constructorState: action.state };
        case "TOGGLE_CONSTRUCTOR":
            return { ...state, constructorOpen: action.open };
        case "BATCH_START":
            return {
                ...state,
                status: "running",
                logs: [],
                progress: 0,
                completedCount: 0,
                failedCount: 0,
                totalCount: action.totalCount,
                eta: "Calculating...",
                currentPrompt: "",
                inputPreview: null,
                outputPreview: null,
                avgDuration: 0,
            };
        case "TASK_START":
            return {
                ...state,
                currentPrompt: action.prompt,
                inputPreview: action.inputPreview,
                // Keep previous outputPreview visible until the next one arrives
                // (it will be replaced by TASK_COMPLETE)
            };
        case "TASK_COMPLETE": {
            const completed = state.completedCount + 1;
            const processed = completed + state.failedCount;
            const progress = state.totalCount > 0 ? (processed / state.totalCount) * 100 : 0;
            const durations = state.avgDuration * state.completedCount;
            const newAvg = (durations + action.duration) / completed;
            return {
                ...state,
                completedCount: completed,
                progress,
                outputPreview: action.outputPreview,
                avgDuration: newAvg,
                eta: formatETA(processed, state.totalCount, newAvg),
            };
        }
        case "TASK_ERROR": {
            const failed = state.failedCount + 1;
            const processed = state.completedCount + failed;
            const progress = state.totalCount > 0 ? (processed / state.totalCount) * 100 : 0;
            return {
                ...state,
                failedCount: failed,
                progress,
                eta: state.avgDuration > 0 ? formatETA(processed, state.totalCount, state.avgDuration) : state.eta,
            };
        }
        case "LOG":
            return { ...state, logs: [...state.logs, action.message] };
        case "BATCH_DONE":
            return { ...state, status: action.status };
        case "RESET":
            return {
                ...state,
                status: "idle",
                logs: [],
                progress: 0,
                completedCount: 0,
                failedCount: 0,
                totalCount: 0,
                eta: "",
                currentPrompt: "",
                inputPreview: null,
                outputPreview: null,
                avgDuration: 0,
            };
        case "SET_LIGHTBOX":
            return { ...state, lightboxSrc: action.src };
        case "SET_IMAGE_ANALYSIS":
            return { ...state, imageAnalysis: action.analysis };
        case "TOGGLE_OPTIMIZER":
            return { ...state, optimizerOpen: action.open };
        default:
            return state;
    }
}

function loadPersistedConfig(): BatchConfig {
    try {
        const raw = storage.get("batch_config");
        return raw ? { ...DEFAULT_BATCH_CONFIG, ...JSON.parse(raw) } : DEFAULT_BATCH_CONFIG;
    } catch { return DEFAULT_BATCH_CONFIG; }
}

function loadPersistedConstructor(): ConstructorState {
    try {
        const raw = storage.get("constructor_state");
        return raw ? JSON.parse(raw) : createDefaultConstructorState();
    } catch { return createDefaultConstructorState(); }
}

function createInitialState(): BatchState {
    return {
        status: "idle",
        files: [],
        config: DEFAULT_BATCH_CONFIG,
        constructorState: createDefaultConstructorState(),
        constructorOpen: false,
        logs: [],
        progress: 0,
        completedCount: 0,
        failedCount: 0,
        totalCount: 0,
        eta: "",
        currentPrompt: "",
        inputPreview: null,
        outputPreview: null,
        avgDuration: 0,
        lightboxSrc: null,
        imageAnalysis: new Map(),
        optimizerOpen: false,
    };
}

// ─── Component ───

export function BatchPage() {
    const [state, dispatch] = useReducer(batchReducer, null, createInitialState);
    const abortRef = useRef<AbortController | null>(null);
    const [hasApiKey, setHasApiKey] = useState(false);

    // Hydrate persisted state from localStorage after mount (avoids hydration mismatch)
    useEffect(() => {
        dispatch({ type: "SET_CONFIG", config: loadPersistedConfig() });
        dispatch({ type: "SET_CONSTRUCTOR", state: loadPersistedConstructor() });
        setHasApiKey(!!storage.getGeminiKey());
    }, []);

    // Persist config changes
    useEffect(() => {
        storage.set("batch_config", JSON.stringify(state.config));
    }, [state.config]);

    // Persist constructor state changes
    useEffect(() => {
        storage.set("constructor_state", JSON.stringify(state.constructorState));
    }, [state.constructorState]);

    // ─── Auto-analyze images when files or resolution tier change ───
    useEffect(() => {
        if (state.files.length === 0) {
            dispatch({ type: "SET_IMAGE_ANALYSIS", analysis: new Map() });
            return;
        }
        let cancelled = false;
        analyzeFiles(state.files, state.config.resolution as ResolutionTier).then((results) => {
            if (!cancelled) {
                dispatch({ type: "SET_IMAGE_ANALYSIS", analysis: results });
            }
        });
        return () => { cancelled = true; };
    }, [state.files, state.config.resolution]);

    // ─── Refs to avoid stale closures in async generator loop ───
    const stateRef = useRef(state);
    stateRef.current = state;

    // ─── Handlers ───

    const processBatchEvent = useCallback((event: BatchEvent) => {
        switch (event.type) {
            case "log":
                dispatch({ type: "LOG", message: event.message });
                break;
            case "task-start": {
                // Create object URL for input preview
                const inputUrl = URL.createObjectURL(event.task.imageFile);
                // flushSync forces React to commit DOM updates synchronously,
                // ensuring the input preview is painted before generation starts.
                flushSync(() => {
                    dispatch({
                        type: "TASK_START",
                        prompt: event.task.promptVariant.prompt,
                        inputPreview: inputUrl,
                    });
                });
                break;
            }
            case "task-complete":
                // flushSync ensures the generated output image is painted
                // to the live preview immediately, not deferred by batching.
                flushSync(() => {
                    dispatch({
                        type: "TASK_COMPLETE",
                        outputPreview: event.result.imageDataUrl || null,
                        duration: event.duration,
                    });
                });
                // Save to gallery if enabled — read from ref to get fresh state
                if (stateRef.current.config.saveToGallery && event.result.imageDataUrl) {
                    // Build descriptive name: OriginalName_Season_Lighting[_Xmas]
                    const baseName = event.task.imageFile.name.replace(/\.[^.]+$/, "");
                    const variantTitle = event.task.promptVariant.title;
                    const displayName = `${baseName}_${variantTitle}`;

                    saveGalleryItem({
                        id: crypto.randomUUID(),
                        dataUrl: event.result.imageDataUrl,
                        prompt: displayName,
                        folder: baseName,
                        source: "batch",
                        createdAt: Date.now(),
                    }).catch((err) => console.warn("Failed to save to gallery:", err));
                }
                break;
            case "task-error":
                dispatch({ type: "TASK_ERROR", duration: event.duration });
                break;
            case "batch-complete":
                dispatch({ type: "BATCH_DONE", status: "completed" });
                break;
            case "batch-stopped":
                dispatch({ type: "BATCH_DONE", status: "stopped" });
                break;
        }
    }, []);

    const handleStart = useCallback(async () => {
        const apiKey = storage.getGeminiKey();
        if (!apiKey) {
            dispatch({ type: "LOG", message: "[ERROR] No Gemini API key. Go to Settings." });
            return;
        }

        // Read from ref to get current values (not stale closure)
        const currentState = stateRef.current;

        if (currentState.files.length === 0) {
            dispatch({ type: "LOG", message: "[ERROR] No images loaded. Drop images first." });
            return;
        }

        const prompts = buildPromptVariants(currentState.constructorState);
        if (prompts.length === 0) {
            dispatch({ type: "LOG", message: "[ERROR] No active prompt variants. Configure the Constructor." });
            return;
        }

        const totalTasks = currentState.files.length * prompts.length;
        dispatch({ type: "BATCH_START", totalCount: totalTasks });

        const controller = new AbortController();
        abortRef.current = controller;

        const provider = new GeminiProvider(apiKey);

        try {
            for await (const event of runBatch(currentState.files, prompts, provider, currentState.config, controller.signal)) {
                processBatchEvent(event);
                // Yield to the event loop so React can flush state updates and repaint.
                // Without this, automatic batching can defer renders until the entire
                // async-generator loop completes, preventing live preview updates.
                await new Promise<void>((r) => setTimeout(r, 0));
            }
        } catch (err) {
            dispatch({ type: "LOG", message: `[CRITICAL] ${err instanceof Error ? err.message : "Unknown error"}` });
            dispatch({ type: "BATCH_DONE", status: "stopped" });
        }

        abortRef.current = null;
    }, [processBatchEvent]);

    const handleStop = useCallback(() => {
        abortRef.current?.abort();
        dispatch({ type: "LOG", message: "Stopping..." });
    }, []);

    const variantCount = countActiveVariants(state.constructorState);
    const isRunning = state.status === "running";

    // Count images that need optimization
    const needsOptimizationCount = Array.from(state.imageAnalysis.values()).filter((a) => !a.matches).length;

    // ─── Keyboard shortcuts ───
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Enter" && !isRunning) {
                e.preventDefault();
                handleStart();
            }
            if (e.key === "Escape" && isRunning) {
                handleStop();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleStart, handleStop, isRunning]);

    return (
        <PageShell title="Batch Generation" subtitle="Process multiple images with prompt variants" icon={Layers}>
            <div className="flex gap-6 h-full p-6">
                {/* Left panel — Config */}
                <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
                    {/* Image count summary */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Images</h3>
                        {state.files.length > 0 && (
                            <span className="text-[10px] text-accent font-medium">{state.files.length} loaded</span>
                        )}
                    </div>

                    {/* Compact image drop zone when files exist, otherwise full */}
                    <div className={state.files.length > 0 ? "max-h-44 shrink-0" : "h-44 shrink-0"}>
                        <ImageDropZone
                            files={state.files}
                            onFilesChange={(files) => dispatch({ type: "SET_FILES", files })}
                            disabled={isRunning}
                            analysisMap={state.imageAnalysis}
                        />
                    </div>

                    {/* Image Optimizer button — only show when files are loaded */}
                    {state.files.length > 0 && state.imageAnalysis.size > 0 && (
                        <button
                            onClick={() => dispatch({ type: "TOGGLE_OPTIMIZER", open: true })}
                            disabled={isRunning}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.98] group
                                ${needsOptimizationCount > 0
                                    ? "bg-yellow-500/10 border border-yellow-500/30 hover:border-yellow-500/50 hover:bg-yellow-500/15"
                                    : "bg-green-500/10 border border-green-500/30 hover:border-green-500/50 hover:bg-green-500/15"}
                                ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            <Zap size={16} className={needsOptimizationCount > 0 ? "text-yellow-400" : "text-green-400"} />
                            <div className="text-left flex-1">
                                <p className="text-xs font-medium">
                                    {needsOptimizationCount > 0
                                        ? `${needsOptimizationCount} image${needsOptimizationCount !== 1 ? "s" : ""} need optimization`
                                        : "All images optimized"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Resolution check for {state.config.resolution} tier
                                </p>
                            </div>
                            <ChevronDown size={14} className="text-muted-foreground -rotate-90" />
                        </button>
                    )}

                    {/* Generation Settings */}
                    <div>
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Generation Settings</h3>
                        <BatchConfigPanel
                            config={state.config}
                            onChange={(config) => dispatch({ type: "SET_CONFIG", config })}
                            disabled={isRunning}
                        />
                    </div>

                    {/* Constructor button */}
                    <button
                        onClick={() => dispatch({ type: "TOGGLE_CONSTRUCTOR", open: true })}
                        disabled={isRunning}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border hover:border-accent/40 hover:bg-card-hover transition-all duration-200 active:scale-[0.98] group
                            ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                        <SlidersHorizontal size={18} className="text-muted-foreground group-hover:text-accent transition-colors duration-200" />
                        <div className="text-left flex-1">
                            <p className="text-sm font-medium">Prompt Constructor</p>
                            <p className="text-[10px] text-muted-foreground">
                                {state.constructorState.sceneType} · {variantCount} variant{variantCount !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <ChevronDown size={14} className="text-muted-foreground -rotate-90" />
                    </button>

                    {/* Task summary */}
                    {state.files.length > 0 && variantCount > 0 && (
                        <div className="bg-muted rounded-xl px-4 py-3">
                            <p className="text-xs text-muted-foreground">
                                <span className="text-foreground font-medium">{state.files.length}</span> image{state.files.length !== 1 ? "s" : ""} × <span className="text-foreground font-medium">{variantCount}</span> variant{variantCount !== 1 ? "s" : ""} = <span className="text-accent font-semibold">{state.files.length * variantCount}</span> total tasks
                            </p>
                        </div>
                    )}

                    {/* API key warning */}
                    {!hasApiKey && (
                        <div className="px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                            <p className="text-[11px] text-yellow-400">⚠ No Gemini API key set. Go to Settings.</p>
                        </div>
                    )}

                    {/* Keyboard shortcut hint */}
                    <p className="text-[9px] text-muted-foreground/30 mt-auto px-1">
                        Ctrl+Enter to start · Escape to stop
                    </p>
                </div>

                {/* Right panel — Monitoring */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
                    {/* Constructor overlay */}
                    <div className={`absolute inset-0 z-10 bg-background rounded-2xl border border-border flex flex-col transition-all duration-300 ease-out overflow-hidden
                        ${state.constructorOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-[0.97] pointer-events-none"}`}>
                        <ConstructorPanel
                            state={state.constructorState}
                            onChange={(s) => dispatch({ type: "SET_CONSTRUCTOR", state: s })}
                            onClose={() => dispatch({ type: "TOGGLE_CONSTRUCTOR", open: false })}
                        />
                    </div>

                    {/* Optimizer overlay */}
                    <div className={`absolute inset-0 z-10 bg-background rounded-2xl border border-border flex flex-col transition-all duration-300 ease-out overflow-hidden
                        ${state.optimizerOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-[0.97] pointer-events-none"}`}>
                        <ImageOptimizerPanel
                            files={state.files}
                            analysisMap={state.imageAnalysis}
                            tier={state.config.resolution as ResolutionTier}
                            onOptimized={(files) => dispatch({ type: "SET_FILES", files })}
                            onClose={() => dispatch({ type: "TOGGLE_OPTIMIZER", open: false })}
                        />
                    </div>

                    {/* Monitoring — direct flex child, no extra scroll wrapper */}
                    <MonitoringPanel
                        status={state.status}
                        logs={state.logs}
                        progress={state.progress}
                        completedCount={state.completedCount}
                        totalCount={state.totalCount}
                        eta={state.eta}
                        currentPrompt={state.currentPrompt}
                        inputPreview={state.inputPreview}
                        outputPreview={state.outputPreview}
                        failedCount={state.failedCount}
                        onStart={handleStart}
                        onStop={handleStop}
                        onImageClick={(src) => dispatch({ type: "SET_LIGHTBOX", src })}
                    />
                </div>
            </div>

            {/* Lightbox */}
            {state.lightboxSrc && (
                <ImageLightbox src={state.lightboxSrc} onClose={() => dispatch({ type: "SET_LIGHTBOX", src: null })} />
            )}
        </PageShell>
    );
}

// ─── Shared layout components (duplicated minimally to avoid circular deps) ───

function PageShell({ title, subtitle, icon: Icon, children }: {
    title: string; subtitle: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    children?: React.ReactNode;
}) {
    return (
        <div className="h-full flex flex-col">
            <header className="px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                    <Icon size={20} className="text-muted-foreground" />
                    <div>
                        <h1 className="text-base font-semibold">{title}</h1>
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                    </div>
                </div>
            </header>
            <div className="flex-1 overflow-hidden">{children}</div>
        </div>
    );
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const handleDownload = () => {
        const a = document.createElement("a");
        a.href = src;
        a.download = `batch_${Date.now()}.png`;
        a.click();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img src={src} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
                <div className="absolute top-3 right-3 flex gap-2">
                    <button onClick={handleDownload}
                        className="p-2.5 bg-black/60 hover:bg-black/80 rounded-xl text-white transition-all duration-200 active:scale-95" title="Download">
                        <Download size={16} />
                    </button>
                    <button onClick={onClose}
                        className="p-2.5 bg-black/60 hover:bg-black/80 rounded-xl text-white transition-all duration-200 active:scale-95" title="Close">
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
