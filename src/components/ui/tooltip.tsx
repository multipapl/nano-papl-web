"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
    label: string;
    children: ReactNode;
    side?: TooltipSide;
    className?: string;
}

const VIEWPORT_PADDING = 8;
const GAP = 8;
const AUTO_HIDE_MS = 6000;

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

export function Tooltip({ label, children, side = "top", className = "" }: TooltipProps) {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLSpanElement>(null);
    const autoHideTimerRef = useRef<number | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const clearAutoHideTimer = useCallback(() => {
        if (autoHideTimerRef.current === null) return;
        window.clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
    }, []);

    const scheduleAutoHide = useCallback(() => {
        clearAutoHideTimer();
        autoHideTimerRef.current = window.setTimeout(() => {
            setIsOpen(false);
            autoHideTimerRef.current = null;
        }, AUTO_HIDE_MS);
    }, [clearAutoHideTimer]);

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        const tooltip = tooltipRef.current;
        if (!trigger || !tooltip) return;

        const rect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const width = tooltipRect.width;
        const height = tooltipRect.height;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let resolvedSide = side;

        if (side === "top" && rect.top - GAP - height < VIEWPORT_PADDING && viewportHeight - rect.bottom > rect.top) {
            resolvedSide = "bottom";
        } else if (side === "bottom" && rect.bottom + GAP + height > viewportHeight - VIEWPORT_PADDING && rect.top > viewportHeight - rect.bottom) {
            resolvedSide = "top";
        } else if (side === "left" && rect.left - GAP - width < VIEWPORT_PADDING && viewportWidth - rect.right > rect.left) {
            resolvedSide = "right";
        } else if (side === "right" && rect.right + GAP + width > viewportWidth - VIEWPORT_PADDING && rect.left > viewportWidth - rect.right) {
            resolvedSide = "left";
        }

        let left = rect.left + rect.width / 2 - width / 2;
        let top = rect.top - GAP - height;

        if (resolvedSide === "bottom") {
            top = rect.bottom + GAP;
        } else if (resolvedSide === "left") {
            left = rect.left - GAP - width;
            top = rect.top + rect.height / 2 - height / 2;
        } else if (resolvedSide === "right") {
            left = rect.right + GAP;
            top = rect.top + rect.height / 2 - height / 2;
        }

        tooltip.style.left = `${clamp(left, VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING)}px`;
        tooltip.style.top = `${clamp(top, VIEWPORT_PADDING, viewportHeight - height - VIEWPORT_PADDING)}px`;
        tooltip.style.visibility = "visible";
    }, [side]);

    const show = useCallback(() => {
        setIsOpen(true);
        scheduleAutoHide();
    }, [scheduleAutoHide]);

    const hide = useCallback(() => {
        clearAutoHideTimer();
        setIsOpen(false);
    }, [clearAutoHideTimer]);

    const handleMouseMove = useCallback(() => {
        setIsOpen(true);
        scheduleAutoHide();
    }, [scheduleAutoHide]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = window.requestAnimationFrame(updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => clearAutoHideTimer, [clearAutoHideTimer]);

    return (
        <span
            ref={triggerRef}
            className={`inline-flex ${className}`}
            onMouseEnter={show}
            onMouseMove={handleMouseMove}
            onMouseLeave={hide}
            onFocusCapture={show}
            onBlurCapture={hide}
        >
            {children}
            {typeof document !== "undefined" && isOpen && createPortal(
                <span
                    ref={tooltipRef}
                    role="tooltip"
                    style={{ zIndex: 2147483647, visibility: "hidden" }}
                    className="pointer-events-none fixed left-0 top-0 w-max max-w-56 rounded-lg border border-border/80 bg-card/90 px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-xl backdrop-blur-md"
                >
                    {label}
                </span>,
                document.body
            )}
        </span>
    );
}
