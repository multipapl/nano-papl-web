"use client";

import { ArrowRight } from "lucide-react";

interface ImageCompareProps {
    inputSrc: string | null;
    outputSrc: string | null;
    onImageClick?: (src: string) => void;
}

/**
 * Side-by-side INPUT → OUTPUT image comparison widget.
 * Mirrors the Python ModernImageCompare.
 */
export function ImageCompare({ inputSrc, outputSrc, onImageClick }: ImageCompareProps) {
    return (
        <div className="flex flex-col gap-2 min-h-0">
            {/* Titles */}
            <div className="flex items-center gap-2 shrink-0">
                <span className="flex-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">Input</span>
                <span className="w-6" />
                <span className="flex-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">Output</span>
            </div>

            {/* Images — constrained max height so they don't dominate small screens */}
            <div className="flex items-center gap-2 min-h-0">
                {/* Input */}
                <div className="flex-1 aspect-[4/3] max-h-[35vh] bg-muted rounded-xl overflow-hidden flex items-center justify-center">
                    {inputSrc ? (
                        <img
                            src={inputSrc}
                            alt="Input"
                            className="w-full h-full object-contain cursor-pointer hover:brightness-110 transition-all duration-200"
                            onClick={() => onImageClick?.(inputSrc)}
                        />
                    ) : (
                        <span className="text-xs text-muted-foreground/30 italic">Input Image</span>
                    )}
                </div>

                {/* Arrow */}
                <div className="shrink-0 w-6 flex items-center justify-center">
                    <ArrowRight size={16} className="text-muted-foreground/30" />
                </div>

                {/* Output */}
                <div className="flex-1 aspect-[4/3] max-h-[35vh] bg-muted rounded-xl overflow-hidden flex items-center justify-center">
                    {outputSrc ? (
                        <img
                            src={outputSrc}
                            alt="Output"
                            className="w-full h-full object-contain cursor-pointer hover:brightness-110 transition-all duration-200"
                            onClick={() => onImageClick?.(outputSrc)}
                        />
                    ) : (
                        <span className="text-xs text-muted-foreground/30 italic">Generated Output</span>
                    )}
                </div>
            </div>
        </div>
    );
}
