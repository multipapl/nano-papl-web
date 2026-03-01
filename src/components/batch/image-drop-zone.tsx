"use client";

import { useState, useRef, useCallback } from "react";
import { Layers, X, FolderOpen, Upload, Check, AlertTriangle } from "lucide-react";
import { isSupportedImageFile, SUPPORTED_IMAGE_MIMES } from "@/lib/batch/providers/types";
import { type ImageAnalysis, fileKey } from "@/lib/resolutions";

interface ImageDropZoneProps {
    files: File[];
    onFilesChange: (files: File[]) => void;
    disabled?: boolean;
    /** Resolution analysis results per file (keyed by fileKey) */
    analysisMap?: Map<string, ImageAnalysis>;
}

/**
 * Drag-and-drop zone supporting individual files and entire folders.
 * Validates that only image files are accepted; non-images are silently skipped.
 */
export function ImageDropZone({ files, onFilesChange, disabled, analysisMap }: ImageDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [skippedCount, setSkippedCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback((incoming: File[]) => {
        let skipped = 0;
        const valid = incoming.filter((f) => {
            if (SUPPORTED_IMAGE_MIMES.has(f.type) || isSupportedImageFile(f.name)) {
                return true;
            }
            skipped++;
            return false;
        });

        // Deduplicate by name+size
        const existing = new Set(files.map((f) => `${f.name}_${f.size}`));
        const newFiles = valid.filter((f) => !existing.has(`${f.name}_${f.size}`));

        if (newFiles.length > 0) {
            onFilesChange([...files, ...newFiles]);
        }
        setSkippedCount(skipped);
        if (skipped > 0) {
            setTimeout(() => setSkippedCount(0), 4000);
        }
    }, [files, onFilesChange]);

    // ─── Drag handlers ───

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled) return;

        const items = Array.from(e.dataTransfer.items);
        const allFiles: File[] = [];

        // Try to read directories via webkitGetAsEntry
        const entries = items
            .map((item) => item.webkitGetAsEntry?.())
            .filter((entry): entry is FileSystemEntry => entry != null);

        if (entries.length > 0) {
            for (const entry of entries) {
                const entryFiles = await readEntry(entry);
                allFiles.push(...entryFiles);
            }
        } else {
            // Fallback: regular file drop
            const droppedFiles = Array.from(e.dataTransfer.files);
            allFiles.push(...droppedFiles);
        }

        processFiles(allFiles);
    }, [disabled, processFiles]);

    // ─── File input handlers ───

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files || []);
        processFiles(selected);
        e.target.value = "";
    }, [processFiles]);

    const removeFile = useCallback((index: number) => {
        onFilesChange(files.filter((_, i) => i !== index));
    }, [files, onFilesChange]);

    const clearAll = useCallback(() => {
        onFilesChange([]);
        setSkippedCount(0);
    }, [onFilesChange]);

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* Drop zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={`relative flex-1 ${files.length === 0 ? "min-h-[180px]" : "min-h-0"} border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-300 
                    ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-muted-foreground/30"}
                    ${isDragging ? "border-accent/60 bg-accent/5 scale-[1.01]" : "border-border"}`}
            >
                {files.length === 0 ? (
                    <>
                        <Upload size={36} className={`transition-colors duration-200 ${isDragging ? "text-accent" : "text-muted-foreground/20"}`} />
                        <p className="text-sm text-muted-foreground">Drop images or a folder here</p>
                        <p className="text-xs text-muted-foreground/40">JPG, PNG, WebP, GIF, BMP</p>
                        <div className="flex gap-2 mt-2">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-card-hover text-muted-foreground transition-all duration-200"
                                disabled={disabled}
                            >
                                Select Files
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                                className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-card-hover text-muted-foreground transition-all duration-200 flex items-center gap-1"
                                disabled={disabled}
                            >
                                <FolderOpen size={12} /> Select Folder
                            </button>
                        </div>
                    </>
                ) : (
                    /* Thumbnail grid */
                    <div className="w-full h-full p-3 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-xs text-muted-foreground">
                                {files.length} image{files.length !== 1 ? "s" : ""} loaded
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                    disabled={disabled}
                                >
                                    <Upload size={10} /> Add more
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                                    disabled={disabled}
                                >
                                    Clear all
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                            {files.map((file, i) => {
                                const key = fileKey(file);
                                const analysis = analysisMap?.get(key);
                                return (
                                    <div key={`${file.name}-${file.size}-${i}`} className="group relative aspect-square rounded-lg overflow-hidden bg-muted">
                                        <ImageThumbnail file={file} />
                                        {/* Resolution status badge */}
                                        {analysis && (
                                            <span
                                                className={`absolute top-1 left-1 p-0.5 rounded-full ${
                                                    analysis.matches
                                                        ? "bg-green-500/80"
                                                        : "bg-yellow-500/80"
                                                }`}
                                                title={
                                                    analysis.matches
                                                        ? `OK: ${analysis.original.width}×${analysis.original.height}`
                                                        : `Needs resize: ${analysis.original.width}×${analysis.original.height} → ${analysis.target.width}×${analysis.target.height}`
                                                }
                                            >
                                                {analysis.matches ? (
                                                    <Check size={8} className="text-white" />
                                                ) : (
                                                    <AlertTriangle size={8} className="text-white" />
                                                )}
                                            </span>
                                        )}
                                        {!disabled && (
                                            <button
                                                onClick={() => removeFile(i)}
                                                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-500/80"
                                            >
                                                <X size={10} />
                                            </button>
                                        )}
                                        <p className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[8px] text-white truncate">
                                            {file.name}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Skipped notification */}
                {skippedCount > 0 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 text-xs animate-fade-in">
                        {skippedCount} non-image file{skippedCount !== 1 ? "s" : ""} skipped
                    </div>
                )}
            </div>

            {/* Hidden inputs */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                className="hidden"
                onChange={handleFileInput}
            />
            <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                className="hidden"
                onChange={handleFileInput}
            />
        </div>
    );
}

// ─── Thumbnail component ───

function ImageThumbnail({ file }: { file: File }) {
    const [src, setSrc] = useState<string | null>(null);

    // Create object URL lazily
    if (!src) {
        const url = URL.createObjectURL(file);
        setSrc(url);
    }

    return src ? (
        <img
            src={src}
            alt={file.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onLoad={() => {
                // Don't revoke — we may need it later for preview
            }}
        />
    ) : (
        <div className="w-full h-full flex items-center justify-center">
            <Layers size={16} className="text-muted-foreground/30" />
        </div>
    );
}

// ─── Directory reading helper ───

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
        return new Promise((resolve) => {
            (entry as FileSystemFileEntry).file(
                (file) => resolve([file]),
                () => resolve([]),
            );
        });
    }

    if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await readAllEntries(reader);
        const files: File[] = [];
        for (const child of entries) {
            const childFiles = await readEntry(child);
            files.push(...childFiles);
        }
        return files;
    }

    return [];
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    return new Promise((resolve) => {
        const all: FileSystemEntry[] = [];
        const readBatch = () => {
            reader.readEntries((entries) => {
                if (entries.length === 0) {
                    resolve(all);
                } else {
                    all.push(...entries);
                    readBatch(); // Keep reading until empty (batched API)
                }
            }, () => resolve(all));
        };
        readBatch();
    });
}
