"use client";

import { useState, useMemo, Fragment, useRef, useEffect, useCallback } from "react";
import {
    MessageSquare,
    Layers,
    Image,
    Settings,
    ChevronDown,
    Send,
    Paperclip,
    X,
    Trash2,
    Loader2,
    AlertCircle,
    AlertTriangle,
    Download,
    Plus,
    StopCircle,
    Save,
    Check,
    HardDrive,
    Sparkles,
    FolderOpen,
    ChevronRight,
    Grid3X3,
    LayoutGrid,
    List,
    Star,
    MoreVertical,
    FolderPlus,
    CheckSquare,
    Square,
    XCircle,
} from "lucide-react";
import {
    storage,
    type ChatMessage,
    type ChatSession,
    createChatSession,
    createMessage,
} from "@/lib/storage";
import {
    sendGeminiMessage,
    fileToBase64,
    GEMINI_MODELS,
    DEFAULT_MODEL,
    type GeminiConfig,
} from "@/lib/gemini";
import {
    saveImage,
    loadImages,
    deleteImages,
    saveGalleryItem,
    loadGalleryItems,
    deleteGalleryItem,
    clearGallery,
    updateGalleryItem,
    updateGalleryItemsBatch,
    updateGalleryItemsByIds,
    GALLERY_CHANGED_EVENT,
    type GalleryItem,
    type GalleryChangedDetail,
    getStorageSizeInfo,
    deleteEntireDatabase,
    cleanOrphanedImages,
    type StoreSizeInfo,
} from "@/lib/image-db";
import { clearAllLocalStorage, getLocalStorageSize } from "@/lib/storage";
import { BatchPage } from "@/components/batch/batch-page";

const tabs = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "batch", label: "Batch", icon: Layers },
    { id: "gallery", label: "Gallery", icon: Image },
    { id: "settings", label: "Settings", icon: Settings },
] as const;

type TabId = (typeof tabs)[number]["id"];

/* ═══ (Constructor templates and state moved to components/batch/) ═══ */

/* ═══════════════════════════════════════════════════ */
/* ═══ APP SHELL                                  ═══ */
/* ═══════════════════════════════════════════════════ */

export function AppShell({ children }: { children: React.ReactNode }) {
    const [activeTab, setActiveTab] = useState<TabId>("chat");
    const [direction, setDirection] = useState<"left" | "right">("right");
    const prevTabRef = useRef<TabId>("chat");

    const handleTabChange = (newTab: TabId) => {
        const currentIndex = tabs.findIndex((t) => t.id === prevTabRef.current);
        const newIndex = tabs.findIndex((t) => t.id === newTab);
        setDirection(newIndex > currentIndex ? "right" : "left");
        prevTabRef.current = newTab;
        setActiveTab(newTab);
    };

    return (
        <div className="flex flex-col h-screen bg-background">
            <main className="flex-1 overflow-hidden relative">
                <AnimatedTabContent activeTab={activeTab} direction={direction} />
            </main>
            <nav className="flex items-center justify-center gap-1 px-4 py-2 border-t border-border bg-card/80 backdrop-blur-xl relative z-10">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                            className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-all duration-200 cursor-pointer relative
                                ${isActive ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}>
                            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.5} className="transition-all duration-200" />
                            <span className="text-[10px] font-medium transition-all duration-200">{tab.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

/* ───── Animated Tab Transition ───── */

function AnimatedTabContent({ activeTab, direction }: { activeTab: TabId; direction: "left" | "right" }) {
    const [displayedTab, setDisplayedTab] = useState(activeTab);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (activeTab !== displayedTab) {
            setIsAnimating(true);
            const timer = setTimeout(() => { setDisplayedTab(activeTab); setIsAnimating(false); }, 150);
            return () => clearTimeout(timer);
        }
    }, [activeTab, displayedTab]);

    const slideClass = isAnimating
        ? direction === "right" ? "opacity-0 translate-x-4" : "opacity-0 -translate-x-4"
        : "opacity-100 translate-x-0";

    return (
        <div className={`h-full transition-all duration-200 ease-out ${slideClass}`}>
            <TabContent activeTab={displayedTab} />
        </div>
    );
}

/**
 * All tabs are rendered simultaneously but only the active one is visible.
 * This keeps BatchPage (and its running generation) alive across tab switches.
 */
function TabContent({ activeTab }: { activeTab: TabId }) {
    return (
        <>
            <div className={`h-full ${activeTab === "chat" ? "" : "hidden"}`}><ChatPage /></div>
            <div className={`h-full ${activeTab === "batch" ? "" : "hidden"}`}><BatchPage /></div>
            <div className={`h-full ${activeTab === "gallery" ? "" : "hidden"}`}><GalleryPage /></div>
            <div className={`h-full ${activeTab === "settings" ? "" : "hidden"}`}><SettingsPage /></div>
        </>
    );
}

/* ───── Shared ───── */

function PageShell({ title, subtitle, icon: Icon, children, centered }: {
    title: string; subtitle: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    children?: React.ReactNode; centered?: boolean;
}) {
    return (
        <div className="h-full flex flex-col">
            <header className="px-6 py-4 border-b border-border shrink-0">
                <div className={`flex items-center gap-3 ${centered ? "max-w-xl mx-auto" : ""}`}>
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

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
                {action}
            </div>
            {children}
        </div>
    );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-card border border-border rounded-xl p-4 ${className}`}>{children}</div>;
}

/* ═══════════════════════════════════════════════════ */
/* ═══ CHAT PAGE                                  ═══ */
/* ═══════════════════════════════════════════════════ */

const RESOLUTIONS = ["1K", "2K", "4K"] as const;
const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "Auto"] as const;

function ChatPage() {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [inputText, setInputText] = useState("");
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [genImage, setGenImage] = useState(true);
    const [resolution, setResolution] = useState<string>("1K");
    const [aspectRatio, setAspectRatio] = useState<string>("16:9");
    const [showRatioPicker, setShowRatioPicker] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef(false);

    // Load sessions from localStorage and hydrate images from IndexedDB on mount
    useEffect(() => {
        const saved = storage.getChatHistory();
        if (saved.length > 0) {
            setSessions(saved);
            setActiveSessionId(saved[0].id);

            // Collect all message IDs that had images (marked as "[image]")
            const imageMessageIds = saved.flatMap(s =>
                s.messages.filter(m => m.imageData === "[image]").map(m => m.id)
            );
            if (imageMessageIds.length > 0) {
                loadImages(imageMessageIds).then(imageMap => {
                    // Rehydrate sessions with real image data from IndexedDB
                    setSessions(prev => prev.map(s => ({
                        ...s,
                        messages: s.messages.map(m =>
                            m.imageData === "[image]" && imageMap[m.id]
                                ? { ...m, imageData: imageMap[m.id] }
                                : m
                        ),
                    })));
                }).catch(err => console.warn("Failed to load images from IndexedDB:", err));
            }
        }
        setHasApiKey(!!storage.getGeminiKey());
    }, []);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [sessions, activeSessionId]);

    const activeSession = sessions.find((s) => s.id === activeSessionId);

    const persistSessions = useCallback((newSessions: ChatSession[]) => {
        setSessions(newSessions);
        storage.saveChatHistory(newSessions);
    }, []);

    const handleNewChat = () => {
        const session = createChatSession();
        const updated = [session, ...sessions];
        persistSessions(updated);
        setActiveSessionId(session.id);
        setError(null);
    };

    const handleDeleteChat = (id: string) => {
        // Clean up images from IndexedDB for deleted session
        const session = sessions.find(s => s.id === id);
        if (session) {
            const imgIds = session.messages.filter(m => m.imageData && m.imageData !== "[image]").map(m => m.id);
            // Also include "[image]" markers (persisted in IndexedDB but not yet hydrated)
            const allImgIds = session.messages.filter(m => m.imageData).map(m => m.id);
            deleteImages(allImgIds).catch(err => console.warn("Failed to delete images from IndexedDB:", err));
        }
        const updated = sessions.filter((s) => s.id !== id);
        persistSessions(updated);
        if (activeSessionId === id) {
            setActiveSessionId(updated.length > 0 ? updated[0].id : null);
        }
    };

    const handleSend = async () => {
        if ((!inputText.trim() && !attachedImage) || isLoading) return;

        const apiKey = storage.getGeminiKey();
        if (!apiKey) {
            setError("No Gemini API key. Go to Settings to add one.");
            return;
        }

        // Create session if none exists
        let session = activeSession;
        let currentSessions = [...sessions];
        if (!session) {
            session = createChatSession();
            currentSessions = [session, ...currentSessions];
            setActiveSessionId(session.id);
        }

        // Add user message
        const userMsg = createMessage("user", inputText, attachedImage || undefined);
        session = {
            ...session,
            messages: [...session.messages, userMsg],
            updatedAt: Date.now(),
            title: session.messages.length === 0 ? inputText.slice(0, 30) || "Image chat" : session.title,
        };
        currentSessions = currentSessions.map((s) => (s.id === session!.id ? session! : s));
        persistSessions(currentSessions);

        // Save user's attached image to IndexedDB
        if (attachedImage) {
            saveImage(userMsg.id, attachedImage).catch(err =>
                console.warn("Failed to save user image to IndexedDB:", err));
        }

        const messageText = inputText;
        const messageImage = attachedImage;
        setInputText("");
        setAttachedImage(null);
        setIsLoading(true);
        setError(null);
        abortRef.current = false;

        try {
            // If genImage is off, force flash model (text-only)
            const effectiveModel = genImage ? selectedModel : GEMINI_MODELS.find(m => !m.supportsImages)?.id || selectedModel;

            const config: GeminiConfig = {
                model: effectiveModel,
                resolution: resolution,
                ratio: aspectRatio,
            };

            const response = await sendGeminiMessage(
                apiKey,
                session.messages.slice(0, -1), // History (without the message we just added)
                messageText,
                messageImage,
                config,
            );

            if (abortRef.current) return;

            if (response.error) {
                setError(response.error);
                return;
            }

            // Add model response
            const modelMsg = createMessage("model", response.text, response.imageData);
            const updatedSession = {
                ...session,
                messages: [...session.messages, modelMsg],
                updatedAt: Date.now(),
            };
            const finalSessions = currentSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s));
            persistSessions(finalSessions);

            // Save model's generated image to IndexedDB
            if (response.imageData) {
                saveImage(modelMsg.id, response.imageData).catch(err =>
                    console.warn("Failed to save model image to IndexedDB:", err));

                // Also save to gallery
                saveGalleryItem({
                    id: crypto.randomUUID(),
                    dataUrl: response.imageData,
                    prompt: messageText || "Image generation",
                    source: "chat",
                    sessionId: session!.id,
                    createdAt: Date.now(),
                }).catch(err =>
                    console.warn("Failed to save image to gallery:", err));
            }
        } catch (err: unknown) {
            if (!abortRef.current) {
                setError(err instanceof Error ? err.message : "Unknown error");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const base64 = await fileToBase64(file);
            setAttachedImage(base64);
        } catch {
            setError("Failed to read image file");
        }
        // Reset input so same file can be selected again
        e.target.value = "";
    };

    const handleStop = () => {
        abortRef.current = true;
        setIsLoading(false);
    };

    return (
        <PageShell title="Chat" subtitle="AI conversation with image generation" icon={MessageSquare}>
            <div className="flex h-full p-6 gap-4">
                {/* Sidebar */}
                <aside className="w-52 flex flex-col gap-2 shrink-0">
                    <button onClick={handleNewChat}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition-all duration-200 active:scale-[0.97]">
                        <Plus size={14} /> New Chat
                    </button>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
                        {sessions.map((s) => (
                            <div key={s.id} className={`group flex items-center rounded-lg transition-all duration-150
                                ${s.id === activeSessionId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                                <button onClick={() => { setActiveSessionId(s.id); setError(null); }}
                                    className="flex-1 text-left px-3 py-2 text-sm truncate">{s.title}</button>
                                <button onClick={() => handleDeleteChat(s.id)}
                                    className="px-2 py-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all duration-200">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        {sessions.length === 0 && (
                            <p className="text-xs text-muted-foreground/40 text-center mt-8">No chats yet</p>
                        )}
                    </div>
                </aside>

                {/* Main chat area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {activeSession && activeSession.messages.length > 0 ? (
                            <div className="flex flex-col gap-4 py-4 max-w-3xl mx-auto">
                                {activeSession.messages.map((msg) => (
                                    <ChatBubble key={msg.id} message={msg} onImageClick={(src) => setLightboxSrc(src)} />
                                ))}
                                {isLoading && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Thinking...</span>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center">
                                    <MessageSquare size={48} className="mx-auto text-muted-foreground/20 mb-3" />
                                    <p className="text-sm text-muted-foreground">Start a conversation</p>
                                    <p className="text-xs text-muted-foreground/50 mt-1">Send a message or attach an image</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mx-2 mb-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs max-w-3xl self-center w-full">
                            <AlertCircle size={14} className="shrink-0" />
                            <span className="flex-1">{error}</span>
                            <button onClick={() => setError(null)} className="hover:text-red-300"><X size={12} /></button>
                        </div>
                    )}

                    {/* Attached image preview */}
                    {attachedImage && (
                        <div className="mx-2 mb-2 max-w-3xl self-center w-full">
                            <div className="inline-flex items-center gap-2 bg-muted rounded-lg p-2 pr-3">
                                <img src={attachedImage} alt="attached" className="h-12 w-12 object-cover rounded" />
                                <span className="text-xs text-muted-foreground">Image attached</span>
                                <button onClick={() => setAttachedImage(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="border-t border-border pt-3 pb-3 px-2">
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center bg-muted rounded-xl px-4 py-2.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-accent/30">
                                    <input type="text" placeholder="Type a message..." value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40" />
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileAttach} />
                                    <button onClick={() => fileInputRef.current?.click()}
                                        className="text-muted-foreground hover:text-foreground ml-2 transition-colors duration-200" title="Attach image">
                                        <Paperclip size={18} />
                                    </button>
                                </div>
                                {isLoading ? (
                                    <button onClick={handleStop} className="p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 active:scale-95" title="Stop">
                                        <StopCircle size={16} />
                                    </button>
                                ) : (
                                    <button onClick={handleSend}
                                        disabled={!inputText.trim() && !attachedImage}
                                        className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                                        <Send size={16} />
                                    </button>
                                )}
                            </div>
                            {/* Toolbar: Gen Image toggle, Model, Resolution, Ratio */}
                            <div className="flex items-center gap-3 mt-2 px-1 relative">
                                {/* Gen Image toggle */}
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input type="checkbox" checked={genImage} onChange={(e) => setGenImage(e.target.checked)} className="rounded accent-accent w-3.5 h-3.5" />
                                    <span className="text-xs text-muted-foreground">Gen Image</span>
                                </label>

                                <span className="text-muted-foreground/20">|</span>

                                {/* Model selector */}
                                <div className="relative">
                                    <button onClick={() => { setShowModelPicker(!showModelPicker); setShowRatioPicker(false); }}
                                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200">
                                        <span className="text-muted-foreground/60">Model:</span>
                                        <span className="font-medium">{GEMINI_MODELS.find((m) => m.id === selectedModel)?.label || selectedModel}</span>
                                        <ChevronDown size={10} />
                                    </button>
                                    {showModelPicker && (
                                        <div className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[240px] z-50">
                                            {GEMINI_MODELS.map((m) => (
                                                <button key={m.id} onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                                                    className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-all duration-150
                                                        ${m.id === selectedModel ? "bg-accent/10 text-accent" : "hover:bg-muted text-foreground"}`}>
                                                    <span>{m.label}</span>
                                                    {m.supportsImages && <span className="text-[9px] text-accent/60 bg-accent/10 px-1.5 py-0.5 rounded">IMG</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Resolution (only when genImage) */}
                                {genImage && (
                                    <>
                                        <span className="text-muted-foreground/20">|</span>
                                        <div className="flex items-center gap-1">
                                            {RESOLUTIONS.map((r) => (
                                                <button key={r} onClick={() => setResolution(r)}
                                                    className={`px-2 py-0.5 text-[10px] rounded-md transition-all duration-150
                                                        ${resolution === r ? "bg-accent/20 text-accent font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Aspect Ratio (only when genImage) */}
                                {genImage && (
                                    <>
                                        <span className="text-muted-foreground/20">|</span>
                                        <div className="relative">
                                            <button onClick={() => { setShowRatioPicker(!showRatioPicker); setShowModelPicker(false); }}
                                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200">
                                                <span className="text-muted-foreground/60">Ratio:</span>
                                                <span className="font-medium">{aspectRatio}</span>
                                                <ChevronDown size={10} />
                                            </button>
                                            {showRatioPicker && (
                                                <div className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[120px] z-50 max-h-60 overflow-y-auto">
                                                    {ASPECT_RATIOS.map((r) => (
                                                        <button key={r} onClick={() => { setAspectRatio(r); setShowRatioPicker(false); }}
                                                            className={`w-full text-left px-4 py-1.5 text-xs transition-all duration-150
                                                                ${r === aspectRatio ? "bg-accent/10 text-accent" : "hover:bg-muted text-foreground"}`}>
                                                            {r}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* API key warning */}
                                {!hasApiKey && (
                                    <span className="text-[10px] text-yellow-500/70">⚠ No API key set</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        </PageShell>
    );
}

/* ─── Download helper ─── */

function downloadBase64Image(dataUrl: string, filename: string) {
    try {
        // Extract actual MIME type from the data URL (e.g. "image/png", "image/jpeg", "image/webp")
        const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

        // Map MIME type to correct file extension
        const extMap: Record<string, string> = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
        };
        const ext = extMap[mimeType] || ".png";

        // Fix filename extension to match actual format
        const baseName = filename.replace(/\.[^.]+$/, "");
        const correctedFilename = baseName + ext;

        // Decode base64 to binary — more reliable than fetch() for large data URLs
        const base64Data = dataUrl.split(",")[1];
        const byteCharacters = atob(base64Data);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = correctedFilename;
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 5000);
    } catch (err) {
        console.error("Download failed:", err);
    }
}

/* ─── Lightbox ─── */

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img src={src} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
                <div className="absolute top-3 right-3 flex gap-2">
                    <button onClick={() => downloadBase64Image(src, `generated_${Date.now()}.png`)}
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

/* ─── Chat Bubble ─── */

function ChatBubble({ message, onImageClick }: { message: ChatMessage; onImageClick?: (src: string) => void }) {
    const isUser = message.role === "user";

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${isUser
                ? "bg-user-bubble border border-border rounded-br-md"
                : "bg-card border border-border rounded-bl-md"}`}>
                {message.text && (
                    <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isUser ? "text-user-bubble-text" : "text-foreground"}`}>{message.text}</p>
                )}
                {message.imageData && message.imageData !== "[image]" && (
                    <div className="mt-2 relative group">
                        <img src={message.imageData} alt="Generated"
                            className="rounded-lg max-h-80 w-auto cursor-pointer hover:brightness-110 transition-all duration-200"
                            onClick={() => onImageClick?.(message.imageData!)} />
                        <button onClick={() => downloadBase64Image(message.imageData!, `nanopapl_${new Date(message.timestamp).toISOString().slice(0, 10)}_${message.id.slice(0, 6)}.png`)}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70">
                            <Download size={14} className="text-white" />
                        </button>
                    </div>
                )}
                {message.imageData === "[image]" && (
                    <p className="mt-1 text-xs text-muted-foreground/50 italic">🖼 Image (not saved in history)</p>
                )}
                <p className={`text-[9px] mt-1 ${isUser ? "text-user-bubble-text/40" : "text-muted-foreground/40"}`}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                </p>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ BATCH PAGE — Now in components/batch/       ═══ */
/* ═══════════════════════════════════════════════════ */
/* BatchPage is imported from @/components/batch/batch-page */

/* ═══════════════════════════════════════════════════ */
/* ═══ GALLERY PAGE                               ═══ */
/* ═══════════════════════════════════════════════════ */

type TileSize = "S" | "M" | "L";
type GalleryViewMode = "flat" | "folders";

const TILE_GRID_CLASSES: Record<TileSize, string> = {
    S: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2",
    M: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3",
    L: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4",
};

/** Tiny context menu positioned near a click event. */
function ContextMenu({ x, y, children, onClose }: { x: number; y: number; children: React.ReactNode; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
    }, [onClose]);

    return (
        <div ref={ref} style={{ position: "fixed", left: x, top: y, zIndex: 60 }}
            className="min-w-[160px] py-1 rounded-lg bg-card border border-border shadow-xl animate-fade-in">
            {children}
        </div>
    );
}

function CtxItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
    return (
        <button onClick={onClick}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${danger ? "text-red-400 hover:bg-red-500/10" : "text-foreground hover:bg-muted"}`}>
            {children}
        </button>
    );
}

function GalleryPage() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
    const [tileSize, setTileSize] = useState<TileSize>(() => (storage.get("gallery_tile_size") as TileSize) || "L");
    const [viewMode, setViewMode] = useState<GalleryViewMode>(() => (storage.get("gallery_view_mode") as GalleryViewMode) || "flat");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [starredFilter, setStarredFilter] = useState(false);
    const [customFolders, setCustomFolders] = useState<string[]>(() => {
        try { return JSON.parse(storage.get("gallery_custom_folders") || "[]"); } catch { return []; }
    });

    // Multi-select state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showMoveMenu, setShowMoveMenu] = useState(false);

    // Ref to suppress refresh for optimistic updates (fixes flicker)
    const skipNextRefreshRef = useRef(false);
    const moveMenuRef = useRef<HTMLDivElement>(null);

    // Context menu state
    const [tileMenu, setTileMenu] = useState<{ x: number; y: number; item: GalleryItem } | null>(null);
    const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: string } | null>(null);

    // Close move menu on outside click
    useEffect(() => {
        if (!showMoveMenu) return;
        const handler = (e: MouseEvent) => {
            if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) setShowMoveMenu(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showMoveMenu]);

    // Persist preferences
    useEffect(() => { storage.set("gallery_tile_size", tileSize); }, [tileSize]);
    useEffect(() => { storage.set("gallery_view_mode", viewMode); }, [viewMode]);
    useEffect(() => { storage.set("gallery_custom_folders", JSON.stringify(customFolders)); }, [customFolders]);

    const refresh = useCallback(() => {
        setLoading(true);
        loadGalleryItems()
            .then(setItems)
            .catch(err => console.warn("Failed to load gallery:", err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    // Listen for real-time gallery changes
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<GalleryChangedDetail>).detail;
            if (detail.action === "add" && detail.item) {
                setItems(prev => [detail.item!, ...prev]);
            } else if (detail.action === "update") {
                // Skip refresh if we did an optimistic update (prevents flicker)
                if (skipNextRefreshRef.current) {
                    skipNextRefreshRef.current = false;
                    return;
                }
                refresh();
            } else {
                refresh();
            }
        };
        window.addEventListener(GALLERY_CHANGED_EVENT, handler);
        return () => window.removeEventListener(GALLERY_CHANGED_EVENT, handler);
    }, [refresh]);

    // ─── Handlers ───

    const handleDelete = useCallback((id: string) => {
        deleteGalleryItem(id)
            .then(() => setItems(prev => prev.filter(i => i.id !== id)))
            .catch(err => console.warn("Failed to delete gallery item:", err));
        setSelectedItem(prev => prev?.id === id ? null : prev);
    }, []);

    const handleClearAll = useCallback(() => {
        if (!confirm("Delete all gallery images?")) return;
        clearGallery()
            .then(() => { setItems([]); setSelectedItem(null); })
            .catch(err => console.warn("Failed to clear gallery:", err));
    }, []);

    const handleDownload = useCallback((item: GalleryItem) => {
        const a = document.createElement("a");
        a.href = item.dataUrl;
        const safeName = item.prompt.replace(/[^a-zA-Z0-9_\-]/g, "_");
        a.download = `${safeName}.png`;
        a.click();
    }, []);

    const handleToggleStar = useCallback((item: GalleryItem) => {
        const newStarred = !item.starred;
        // Optimistic update — skip the refresh triggered by the DB event
        skipNextRefreshRef.current = true;
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, starred: newStarred } : i));
        if (selectedItem?.id === item.id) {
            setSelectedItem(prev => prev ? { ...prev, starred: newStarred } : null);
        }
        updateGalleryItem(item.id, { starred: newStarred })
            .catch(err => { console.warn("Failed to toggle star:", err); skipNextRefreshRef.current = false; refresh(); });
    }, [selectedItem, refresh]);

    const handleMoveToFolder = useCallback((itemId: string, folder: string | undefined) => {
        skipNextRefreshRef.current = true;
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, folder } : i));
        updateGalleryItem(itemId, { folder })
            .catch(err => { console.warn("Failed to move item:", err); skipNextRefreshRef.current = false; refresh(); });
        setTileMenu(null);
    }, [refresh]);

    const handleCreateFolder = useCallback(() => {
        const name = prompt("New folder name:");
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        if (!customFolders.includes(trimmed)) {
            setCustomFolders(prev => [...prev, trimmed]);
        }
    }, [customFolders]);

    const handleRenameFolder = useCallback((oldName: string) => {
        const newName = prompt(`Rename folder "${oldName}":`, oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) { setFolderMenu(null); return; }
        const trimmed = newName.trim();
        // Update all items in this folder
        updateGalleryItemsBatch(oldName, trimmed)
            .then(() => {
                // Update custom folders list
                setCustomFolders(prev => prev.map(f => f === oldName ? trimmed : f));
                refresh();
            })
            .catch(err => console.warn("Failed to rename folder:", err));
        setFolderMenu(null);
    }, [refresh]);

    const handleDeleteFolder = useCallback((folderName: string) => {
        if (!confirm(`Delete folder "${folderName}"? Images will be moved to Ungrouped.`)) { setFolderMenu(null); return; }
        updateGalleryItemsBatch(folderName, undefined)
            .then(() => {
                setCustomFolders(prev => prev.filter(f => f !== folderName));
                refresh();
            })
            .catch(err => console.warn("Failed to delete folder:", err));
        setFolderMenu(null);
    }, [refresh]);

    // ─── Multi-select handlers ───

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        const visible = starredFilter ? items.filter(i => i.starred) : items;
        setSelectedIds(new Set(visible.map(i => i.id)));
    }, [items, starredFilter]);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const exitSelectionMode = useCallback(() => {
        setSelectionMode(false);
        setSelectedIds(new Set());
        setShowMoveMenu(false);
    }, []);

    const handleBatchMoveToFolder = useCallback((folder: string | undefined) => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        // Optimistic update
        skipNextRefreshRef.current = true;
        setItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, folder } : i));
        updateGalleryItemsByIds(ids, { folder })
            .catch(err => { console.warn("Failed to batch move:", err); skipNextRefreshRef.current = false; refresh(); });
        setShowMoveMenu(false);
        exitSelectionMode();
    }, [selectedIds, refresh, exitSelectionMode]);

    const handleBatchDelete = useCallback(() => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!confirm(`Delete ${ids.length} selected image${ids.length !== 1 ? "s" : ""}?`)) return;
        // Optimistic update
        setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
        Promise.all(ids.map(id => deleteGalleryItem(id)))
            .catch(err => { console.warn("Failed to batch delete:", err); refresh(); });
        exitSelectionMode();
    }, [selectedIds, refresh, exitSelectionMode]);

    const handleBatchStar = useCallback((starred: boolean) => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        skipNextRefreshRef.current = true;
        setItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, starred } : i));
        updateGalleryItemsByIds(ids, { starred })
            .catch(err => { console.warn("Failed to batch star:", err); skipNextRefreshRef.current = false; refresh(); });
    }, [selectedIds, refresh]);

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
            + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    };

    const toggleFolder = (folder: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(folder)) next.delete(folder); else next.add(folder);
            return next;
        });
    };

    // ─── Computed data ───

    // Filter items by starred if filter is on
    const filteredItems = useMemo(() =>
        starredFilter ? items.filter(i => i.starred) : items
    , [items, starredFilter]);

    // All known folder names (from items + custom)
    const allFolderNames = useMemo(() => {
        const fromItems = new Set(items.map(i => i.folder).filter(Boolean) as string[]);
        for (const cf of customFolders) fromItems.add(cf);
        return Array.from(fromItems).sort();
    }, [items, customFolders]);

    // Group filtered items by folder
    const folderGroups = useMemo(() => {
        const groups = new Map<string, GalleryItem[]>();
        // Ensure custom folders appear even if empty (only when not filtering by starred)
        if (!starredFilter) {
            for (const cf of customFolders) {
                if (!groups.has(cf)) groups.set(cf, []);
            }
        }
        for (const item of filteredItems) {
            const key = item.folder || "Ungrouped";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        }
        return groups;
    }, [filteredItems, customFolders, starredFilter]);

    // ─── Loading / empty states ───

    if (loading) {
        return (
            <PageShell title="Gallery" subtitle="Generated images" icon={Image}>
                <div className="flex items-center justify-center h-full">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
            </PageShell>
        );
    }

    if (items.length === 0) {
        return (
            <PageShell title="Gallery" subtitle="Generated images" icon={Image}>
                <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
                        <Image size={32} className="text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">No images yet</p>
                    <p className="text-xs text-muted-foreground/40 max-w-xs text-center">
                        Images generated from Chat and Batch will appear here.
                    </p>
                </div>
            </PageShell>
        );
    }

    // ─── Render tile ───

    const renderTile = (item: GalleryItem) => {
        const isSelected = selectedIds.has(item.id);
        const handleTileClick = selectionMode
            ? () => toggleSelection(item.id)
            : () => setSelectedItem(item);
        return (
        <div key={item.id}
            className={`group relative bg-card border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg ${
                selectionMode && isSelected
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-accent/40"
            }`}
            onClick={handleTileClick}
            onContextMenu={(e) => { e.preventDefault(); if (!selectionMode) setTileMenu({ x: e.clientX, y: e.clientY, item }); }}>
            <div className="aspect-square overflow-hidden">
                <img src={item.dataUrl} alt={item.prompt}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </div>
            {/* Selection checkbox (in selection mode) */}
            {selectionMode && (
                <div className={`absolute top-1.5 left-1.5 p-0.5 rounded-md transition-all duration-200 ${
                    isSelected ? "text-accent bg-black/50" : "text-white/60 bg-black/30"
                }`}>
                    {isSelected
                        ? <CheckSquare size={tileSize === "S" ? 12 : 16} />
                        : <Square size={tileSize === "S" ? 12 : 16} />}
                </div>
            )}
            {/* Star icon — always visible (hidden in selection mode) */}
            {!selectionMode && (
                <button onClick={(e) => { e.stopPropagation(); handleToggleStar(item); }}
                    className={`absolute top-1.5 left-1.5 p-1 rounded-md transition-all duration-200 ${item.starred ? "text-yellow-400 bg-black/40" : "text-white/50 bg-black/30 opacity-0 group-hover:opacity-100"}`}
                    title={item.starred ? "Unstar" : "Star"}>
                    <Star size={tileSize === "S" ? 10 : 12} fill={item.starred ? "currentColor" : "none"} />
                </button>
            )}
            {/* Info section */}
            {tileSize === "L" && (
                <div className="p-3">
                    <p className="text-xs text-foreground truncate">{item.prompt}</p>
                    <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">{item.source}</span>
                    </div>
                </div>
            )}
            {tileSize === "M" && (
                <div className="px-2 py-1.5">
                    <p className="text-[10px] text-foreground truncate">{item.prompt}</p>
                </div>
            )}
            {tileSize === "S" && (
                <p className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[8px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {item.prompt}
                </p>
            )}
            {/* Hover overlay actions (hidden in selection mode) */}
            {!selectionMode && (
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                    className="p-1 rounded-md bg-black/60 hover:bg-black/80 transition-colors" title="Download">
                    <Download size={tileSize === "S" ? 10 : 12} className="text-white" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setTileMenu({ x: e.clientX, y: e.clientY, item }); }}
                    className="p-1 rounded-md bg-black/60 hover:bg-black/80 transition-colors" title="More">
                    <MoreVertical size={tileSize === "S" ? 10 : 12} className="text-white" />
                </button>
            </div>
            )}
        </div>
        );
    };

    const starCount = items.filter(i => i.starred).length;

    return (
        <PageShell title="Gallery" subtitle={`${items.length} image${items.length !== 1 ? "s" : ""}`} icon={Image}>
            {/* Lightbox overlay */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
                    onClick={() => setSelectedItem(null)}>
                    <div className="relative max-w-4xl max-h-full flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 truncate">{selectedItem.prompt}</p>
                                <p className="text-xs text-white/40">
                                    {formatDate(selectedItem.createdAt)} · {selectedItem.source}
                                    {selectedItem.folder && <> · <FolderOpen size={10} className="inline" /> {selectedItem.folder}</>}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                                <button onClick={() => handleToggleStar(selectedItem)}
                                    className={`p-2 rounded-lg transition-colors ${selectedItem.starred ? "bg-yellow-500/20 text-yellow-400" : "bg-white/10 hover:bg-white/20 text-white/60"}`}
                                    title={selectedItem.starred ? "Unstar" : "Star"}>
                                    <Star size={16} fill={selectedItem.starred ? "currentColor" : "none"} />
                                </button>
                                <button onClick={() => handleDownload(selectedItem)}
                                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Download">
                                    <Download size={16} className="text-white" />
                                </button>
                                <button onClick={() => handleDelete(selectedItem.id)}
                                    className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors" title="Delete">
                                    <Trash2 size={16} className="text-red-400" />
                                </button>
                                <button onClick={() => setSelectedItem(null)}
                                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Close">
                                    <X size={16} className="text-white" />
                                </button>
                            </div>
                        </div>
                        <img src={selectedItem.dataUrl} alt={selectedItem.prompt}
                            className="max-h-[75vh] rounded-xl object-contain" />
                    </div>
                </div>
            )}

            {/* Tile context menu */}
            {tileMenu && (
                <ContextMenu x={tileMenu.x} y={tileMenu.y} onClose={() => setTileMenu(null)}>
                    <CtxItem onClick={() => { handleToggleStar(tileMenu.item); setTileMenu(null); }}>
                        {tileMenu.item.starred ? "★ Unstar" : "☆ Star"}
                    </CtxItem>
                    <CtxItem onClick={() => { handleDownload(tileMenu.item); setTileMenu(null); }}>
                        Download
                    </CtxItem>
                    <div className="border-t border-border my-1" />
                    <div className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Move to folder</div>
                    <CtxItem onClick={() => handleMoveToFolder(tileMenu.item.id, undefined)}>
                        Ungrouped
                    </CtxItem>
                    {allFolderNames.map(f => (
                        <CtxItem key={f} onClick={() => handleMoveToFolder(tileMenu.item.id, f)}>
                            {f === tileMenu.item.folder ? `✓ ${f}` : f}
                        </CtxItem>
                    ))}
                    <div className="border-t border-border my-1" />
                    <CtxItem onClick={() => { handleDelete(tileMenu.item.id); setTileMenu(null); }} danger>
                        Delete
                    </CtxItem>
                </ContextMenu>
            )}

            {/* Folder header context menu */}
            {folderMenu && (
                <ContextMenu x={folderMenu.x} y={folderMenu.y} onClose={() => setFolderMenu(null)}>
                    <CtxItem onClick={() => handleRenameFolder(folderMenu.folder)}>
                        Rename
                    </CtxItem>
                    <CtxItem onClick={() => handleDeleteFolder(folderMenu.folder)} danger>
                        Delete Folder
                    </CtxItem>
                </ContextMenu>
            )}

            {/* Gallery content */}
            <div className="h-full overflow-y-auto p-6">
                {/* Toolbar */}
                {selectionMode ? (
                    /* ── Selection mode toolbar ── */
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <button onClick={exitSelectionMode}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Exit selection">
                                <XCircle size={12} /> Cancel
                            </button>
                            <span className="text-xs text-muted-foreground">
                                {selectedIds.size} selected
                            </span>
                            <button onClick={selectAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <CheckSquare size={12} /> Select All
                            </button>
                            {selectedIds.size > 0 && (
                                <button onClick={deselectAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                    <Square size={12} /> Deselect
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Batch star */}
                            {selectedIds.size > 0 && (
                                <button onClick={() => handleBatchStar(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                                    title="Star selected">
                                    <Star size={12} fill="currentColor" /> Star
                                </button>
                            )}
                            {/* Batch move to folder */}
                            {selectedIds.size > 0 && (
                                <div className="relative" ref={moveMenuRef}>
                                    <button onClick={() => setShowMoveMenu(!showMoveMenu)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                                        title="Move selected to folder">
                                        <FolderOpen size={12} /> Move to…
                                    </button>
                                    {showMoveMenu && (
                                        <div className="absolute top-full right-0 mt-1 min-w-[180px] py-1 rounded-lg bg-card border border-border shadow-xl z-50 animate-fade-in">
                                            <button onClick={() => handleBatchMoveToFolder(undefined)}
                                                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors">
                                                Ungrouped
                                            </button>
                                            {allFolderNames.map(f => (
                                                <button key={f} onClick={() => handleBatchMoveToFolder(f)}
                                                    className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors">
                                                    {f}
                                                </button>
                                            ))}
                                            <div className="border-t border-border my-1" />
                                            <button onClick={() => {
                                                const name = prompt("New folder name:");
                                                if (name?.trim()) {
                                                    const trimmed = name.trim();
                                                    if (!customFolders.includes(trimmed)) {
                                                        setCustomFolders(prev => [...prev, trimmed]);
                                                    }
                                                    handleBatchMoveToFolder(trimmed);
                                                }
                                            }}
                                                className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-muted transition-colors">
                                                <FolderPlus size={10} className="inline mr-1.5" />New folder…
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Batch delete */}
                            {selectedIds.size > 0 && (
                                <button onClick={handleBatchDelete}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Delete selected">
                                    <Trash2 size={12} /> Delete
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Normal toolbar ── */
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            {/* View mode toggle */}
                            <button onClick={() => setViewMode(viewMode === "flat" ? "folders" : "flat")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${viewMode === "folders" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                                title={viewMode === "flat" ? "Switch to folder view" : "Switch to flat view"}>
                                {viewMode === "flat" ? <FolderOpen size={12} /> : <LayoutGrid size={12} />}
                                {viewMode === "flat" ? "Folders" : "Flat"}
                            </button>

                            {/* Star filter */}
                            <button onClick={() => setStarredFilter(!starredFilter)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${starredFilter ? "bg-yellow-500/15 text-yellow-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                                title={starredFilter ? "Show all" : "Show starred only"}>
                                <Star size={12} fill={starredFilter ? "currentColor" : "none"} />
                                {starCount > 0 && <span>{starCount}</span>}
                            </button>

                            {/* Select mode */}
                            <button onClick={() => setSelectionMode(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Select multiple images">
                                <CheckSquare size={12} /> Select
                            </button>

                            {/* New folder */}
                            {viewMode === "folders" && (
                                <button onClick={handleCreateFolder}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title="Create new folder">
                                    <FolderPlus size={12} /> New
                                </button>
                            )}

                            {/* Tile size selector */}
                            <div className="flex items-center rounded-lg overflow-hidden border border-border">
                                {(["S", "M", "L"] as TileSize[]).map(size => (
                                    <button key={size} onClick={() => setTileSize(size)}
                                        className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${tileSize === size ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleClearAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 size={12} /> Clear All
                        </button>
                    </div>
                )}

                {/* Empty filter state */}
                {filteredItems.length === 0 && starredFilter && (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Star size={32} className="text-muted-foreground/20" />
                        <p className="text-sm text-muted-foreground">No starred images</p>
                        <button onClick={() => setStarredFilter(false)}
                            className="text-xs text-accent hover:underline">Show all images</button>
                    </div>
                )}

                {/* Flat view */}
                {viewMode === "flat" && filteredItems.length > 0 && (
                    <div className={`grid ${TILE_GRID_CLASSES[tileSize]}`}>
                        {filteredItems.map(renderTile)}
                    </div>
                )}

                {/* Folder view */}
                {viewMode === "folders" && filteredItems.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {Array.from(folderGroups.entries()).map(([folder, folderItems]) => {
                            // Hide empty folders when starred filter is on
                            if (starredFilter && folderItems.length === 0) return null;
                            const isExpanded = expandedFolders.has(folder);
                            const isUserFolder = folder !== "Ungrouped";
                            return (
                                <div key={folder} className="bg-card border border-border rounded-xl overflow-hidden">
                                    {/* Folder header */}
                                    <div className="flex items-center">
                                        <button onClick={() => toggleFolder(folder)}
                                            className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                                            <ChevronRight size={14}
                                                className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                                            <FolderOpen size={16} className="text-accent/70" />
                                            <span className="text-sm font-medium text-foreground flex-1 text-left truncate">{folder}</span>
                                            <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                                                {folderItems.length} image{folderItems.length !== 1 ? "s" : ""}
                                            </span>
                                            {/* Thumbnail strip preview (collapsed) */}
                                            {!isExpanded && folderItems.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {folderItems.slice(0, 4).map(item => (
                                                        <div key={item.id} className="w-7 h-7 rounded-md overflow-hidden border-2 border-card">
                                                            <img src={item.dataUrl} alt="" className="w-full h-full object-cover" />
                                                        </div>
                                                    ))}
                                                    {folderItems.length > 4 && (
                                                        <div className="w-7 h-7 rounded-md bg-muted border-2 border-card flex items-center justify-center">
                                                            <span className="text-[8px] text-muted-foreground">+{folderItems.length - 4}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </button>
                                        {/* Folder actions menu */}
                                        {isUserFolder && (
                                            <button onClick={(e) => { e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY, folder }); }}
                                                className="p-2 mr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                title="Folder actions">
                                                <MoreVertical size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {/* Folder content */}
                                    {isExpanded && folderItems.length > 0 && (
                                        <div className={`grid ${TILE_GRID_CLASSES[tileSize]} px-4 pb-4`}>
                                            {folderItems.map(renderTile)}
                                        </div>
                                    )}
                                    {isExpanded && folderItems.length === 0 && (
                                        <div className="px-4 pb-4 text-xs text-muted-foreground/40 text-center py-6">
                                            Empty folder
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </PageShell>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ SETTINGS PAGE                              ═══ */
/* ═══════════════════════════════════════════════════ */

/** Format bytes to human-readable string. */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function SettingsPage() {
    const [geminiKey, setGeminiKey] = useState("");
    const [falKey, setFalKey] = useState("");
    const [openRouterKey, setOpenRouterKey] = useState("");
    const [saved, setSaved] = useState(false);

    // Storage management state
    const [storeSizes, setStoreSizes] = useState<StoreSizeInfo[]>([]);
    const [localStorageBytes, setLocalStorageBytes] = useState(0);
    const [loadingSize, setLoadingSize] = useState(true);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [cleaningOrphans, setCleaningOrphans] = useState(false);
    const [orphanResult, setOrphanResult] = useState<string | null>(null);

    const refreshStorageInfo = useCallback(async () => {
        setLoadingSize(true);
        try {
            const sizes = await getStorageSizeInfo();
            setStoreSizes(sizes);
            setLocalStorageBytes(getLocalStorageSize());
        } catch (err) {
            console.warn("Failed to get storage info:", err);
        } finally {
            setLoadingSize(false);
        }
    }, []);

    useEffect(() => {
        setGeminiKey(storage.getGeminiKey());
        setFalKey(storage.getFalKey());
        setOpenRouterKey(storage.getOpenRouterKey());
        refreshStorageInfo();
    }, [refreshStorageInfo]);

    const handleSave = () => {
        storage.setGeminiKey(geminiKey);
        storage.setFalKey(falKey);
        storage.setOpenRouterKey(openRouterKey);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleClearAllData = async () => {
        setClearing(true);
        try {
            clearAllLocalStorage();
            await deleteEntireDatabase();
            // Reset local state
            setGeminiKey("");
            setFalKey("");
            setOpenRouterKey("");
            setShowClearConfirm(false);
            await refreshStorageInfo();
        } catch (err) {
            console.error("Failed to clear data:", err);
        } finally {
            setClearing(false);
        }
    };

    const handleCleanOrphans = async () => {
        setCleaningOrphans(true);
        setOrphanResult(null);
        try {
            const sessions = storage.getChatHistory();
            const validIds = new Set<string>();
            for (const s of sessions) {
                for (const m of s.messages) {
                    if (m.imageData) validIds.add(m.id);
                }
            }
            const removed = await cleanOrphanedImages(validIds);
            setOrphanResult(removed > 0 ? `Cleaned ${removed} orphaned image(s)` : "No orphans found");
            await refreshStorageInfo();
            setTimeout(() => setOrphanResult(null), 3000);
        } catch (err) {
            setOrphanResult("Error cleaning orphans");
            console.error(err);
        } finally {
            setCleaningOrphans(false);
        }
    };

    const totalBytes = storeSizes.reduce((sum, s) => sum + s.bytes, 0) + localStorageBytes;

    return (
        <PageShell title="Settings" subtitle="API keys and preferences" icon={Settings} centered>
            <div className="max-w-xl mx-auto flex flex-col gap-8 p-6 overflow-y-auto h-full">
                <Section title="API Keys" action={
                    <button onClick={handleSave}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95
                            ${saved ? "bg-green-500/20 text-green-400" : "bg-accent text-white hover:bg-accent-hover"}`}>
                        {saved ? <><Check size={12} /> Saved!</> : <><Save size={12} /> Save Keys</>}
                    </button>
                }>
                    <div className="flex flex-col gap-3">
                        <SettingsInput label="Google Gemini" placeholder="AIza..." type="password"
                            value={geminiKey} onInput={setGeminiKey} />
                        <SettingsInput label="Fal AI" placeholder="fal_..." type="password"
                            value={falKey} onInput={setFalKey} />
                        <SettingsInput label="OpenRouter" placeholder="sk-or-..." type="password"
                            value={openRouterKey} onInput={setOpenRouterKey} />
                    </div>
                </Section>

                {/* ─── Storage Management ─── */}
                <Section title="Storage" action={
                    <button onClick={refreshStorageInfo} disabled={loadingSize}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {loadingSize ? <Loader2 size={12} className="animate-spin" /> : "Refresh"}
                    </button>
                }>
                    <Card className="flex flex-col gap-3">
                        {/* Total usage bar */}
                        <div className="flex items-center gap-3">
                            <HardDrive size={16} className="text-muted-foreground shrink-0" />
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium">Total Usage</span>
                                    <span className="text-xs text-muted-foreground">
                                        {loadingSize ? "..." : formatBytes(totalBytes)}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-accent rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, (totalBytes / (500 * 1024 * 1024)) * 100)}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* Breakdown */}
                        {!loadingSize && (
                            <div className="flex flex-col gap-1.5 pl-7">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Settings & Chat History</span>
                                    <span className="text-muted-foreground">{formatBytes(localStorageBytes)}</span>
                                </div>
                                {storeSizes.map((s) => (
                                    <div key={s.label} className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{s.label} ({s.count} items)</span>
                                        <span className="text-muted-foreground">{formatBytes(s.bytes)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Clean orphans button */}
                        <div className="flex items-center gap-2 pt-1">
                            <button onClick={handleCleanOrphans} disabled={cleaningOrphans}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-card-hover transition-all duration-200 active:scale-[0.98] disabled:opacity-50">
                                {cleaningOrphans
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <Sparkles size={12} />}
                                Clean Orphaned Images
                            </button>
                            {orphanResult && (
                                <span className="text-xs text-green-400">{orphanResult}</span>
                            )}
                        </div>
                    </Card>
                </Section>

                <Section title="Appearance">
                    <div className="flex items-center justify-between bg-muted rounded-xl px-4 py-3">
                        <span className="text-sm">Theme</span>
                        <span className="text-xs text-muted-foreground">Dark ●</span>
                    </div>
                </Section>

                <Section title="Data">
                    <div className="flex gap-3">
                        <button className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-muted text-foreground hover:bg-card-hover transition-all duration-200 active:scale-[0.98]">
                            Export All Data
                        </button>
                        <button className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-muted text-foreground hover:bg-card-hover transition-all duration-200 active:scale-[0.98]">
                            Import Data
                        </button>
                    </div>
                </Section>

                {/* ─── Danger Zone ─── */}
                <Section title="Danger Zone">
                    <Card className="border-red-500/30">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-red-400 mb-1">Clear All Local Data</p>
                                <p className="text-xs text-muted-foreground mb-3">
                                    Permanently delete all API keys, chat history, images, gallery, and settings.
                                    This action cannot be undone.
                                </p>
                                {!showClearConfirm ? (
                                    <button onClick={() => setShowClearConfirm(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 active:scale-95">
                                        <Trash2 size={12} /> Delete Everything
                                    </button>
                                ) : (
                                    <div className="flex flex-col gap-2 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                                        <p className="text-xs text-red-300 font-medium">Are you absolutely sure?</p>
                                        <p className="text-xs text-muted-foreground">
                                            All data including API keys, chat messages, generated images, and gallery will be permanently deleted.
                                        </p>
                                        <div className="flex gap-2 mt-1">
                                            <button onClick={handleClearAllData} disabled={clearing}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all duration-200 active:scale-95 disabled:opacity-50">
                                                {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                {clearing ? "Clearing..." : "Yes, Delete All Data"}
                                            </button>
                                            <button onClick={() => setShowClearConfirm(false)}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-card-hover transition-all duration-200">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                </Section>
            </div>
        </PageShell>
    );
}

function SettingsInput({ label, placeholder, type = "text", value, onInput }: {
    label: string; placeholder: string; type?: string; value: string; onInput: (value: string) => void;
}) {
    return (
        <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
            <input type={type} placeholder={placeholder} value={value}
                onChange={(e) => onInput(e.target.value)}
                className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-accent/30 transition-all duration-200" />
        </div>
    );
}
