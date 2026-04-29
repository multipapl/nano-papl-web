"use client";

import { useState, useMemo, Fragment, useRef, useEffect, useCallback } from "react";
import {
    MessageSquare,
    Layers,
    Image as ImageIcon,
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
    LayoutGrid,
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
import { sendFalMessage, type FalChatConfig } from "@/lib/fal";
import {
    PROVIDERS,
    getModel,
    getModelLabel,
    withModelName,
} from "@/lib/providers/registry";
import {
    getProviderSelection,
    setProviderSelection,
    getApiKeyForProvider,
    hasApiKeyForProvider,
} from "@/lib/providers/provider-config";
import type { ProviderSlug } from "@/lib/providers/types";
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
import { Tooltip } from "@/components/ui/tooltip";
import { APP_VERSION } from "@/lib/app-version";

const tabs = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "batch", label: "Batch", icon: Layers },
    { id: "gallery", label: "Gallery", icon: ImageIcon },
    { id: "settings", label: "Settings", icon: Settings },
] as const;

type TabId = (typeof tabs)[number]["id"];
const CHAT_FOLDERS_KEY = "chat_folders";
const CHAT_GALLERY_FOLDER_KEY = "chat_gallery_default_folder";
const GALLERY_CUSTOM_FOLDERS_KEY = "gallery_custom_folders";
const GALLERY_FOLDERS_CHANGED_EVENT = "nanopapl:gallery-folders-changed";
const IMAGE_PLACEHOLDER = "[image]";
const CHAT_ATTACHMENT_LIMIT = 3;
const CHAT_TEXTAREA_MAX_HEIGHT = 180;

function readStringListSetting(name: string): string[] {
    try {
        const raw = storage.get(name);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
    } catch {
        return [];
    }
}

function writeStringListSetting(name: string, values: string[]): void {
    storage.set(name, JSON.stringify(Array.from(new Set(values.map(v => v.trim()).filter(Boolean)))));
}

function notifyGalleryFoldersChanged(): void {
    window.dispatchEvent(new CustomEvent(GALLERY_FOLDERS_CHANGED_EVENT));
}

function getMessageImages(message: ChatMessage): string[] {
    if (message.attachments?.length) {
        return message.attachments.filter((img): img is string => !!img && img !== IMAGE_PLACEHOLDER);
    }
    if (message.imageData && message.imageData !== IMAGE_PLACEHOLDER) {
        return [message.imageData];
    }
    return [];
}

function hasStoredMessageImages(message: ChatMessage): boolean {
    return !!message.imageData || (message.attachments?.length ?? 0) > 0;
}

function needsImageHydration(message: ChatMessage): boolean {
    return message.imageData === IMAGE_PLACEHOLDER || message.attachments?.some((img) => img === IMAGE_PLACEHOLDER) || false;
}

type CapabilityBadgeType = "IMG2IMG" | "TXT2IMG" | "CHAT";

const CAPABILITY_LABELS: Record<CapabilityBadgeType, string> = {
    IMG2IMG: "Can use an existing image as input and transform it.",
    TXT2IMG: "Can generate an image from text only.",
    CHAT: "Can answer chat messages, not only generate images.",
};

const CAPABILITY_CLASSES: Record<CapabilityBadgeType, string> = {
    IMG2IMG: "text-accent/70 bg-accent/10",
    TXT2IMG: "text-green-400/70 bg-green-400/10",
    CHAT: "text-blue-400/70 bg-blue-400/10",
};

function CapabilityBadge({ type }: { type: CapabilityBadgeType }) {
    return (
        <Tooltip label={CAPABILITY_LABELS[type]}>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${CAPABILITY_CLASSES[type]}`}>{type}</span>
        </Tooltip>
    );
}

/* ═══ (Constructor templates and state moved to components/batch/) ═══ */

/* ═══════════════════════════════════════════════════ */
/* ═══ APP SHELL                                  ═══ */
/* ═══════════════════════════════════════════════════ */

export function AppShell() {
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
                        <Tooltip key={tab.id} label={`Open ${tab.label}.`} side="top">
                            <button onClick={() => handleTabChange(tab.id)}
                                className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-all duration-200 cursor-pointer relative
                                    ${isActive ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}>
                                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.5} className="transition-all duration-200" />
                                <span className="text-[10px] font-medium transition-all duration-200">{tab.label}</span>
                            </button>
                        </Tooltip>
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
            const startTimer = setTimeout(() => setIsAnimating(true), 0);
            const timer = setTimeout(() => { setDisplayedTab(activeTab); setIsAnimating(false); }, 150);
            return () => { clearTimeout(startTimer); clearTimeout(timer); };
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
    const [attachedImages, setAttachedImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeProvider, setActiveProvider] = useState<ProviderSlug>("gemini");
    const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [genImage, setGenImage] = useState(true);
    const [resolution, setResolution] = useState<string>("2K");
    const [aspectRatio, setAspectRatio] = useState<string>("16:9");
    const [showRatioPicker, setShowRatioPicker] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dragCounterRef = useRef(0);
    const abortRef = useRef(false);
    const [chatFolders, setChatFolders] = useState<string[]>([]);
    const [expandedChatFolders, setExpandedChatFolders] = useState<Set<string>>(new Set(["Ungrouped"]));
    const [dragChatId, setDragChatId] = useState<string | null>(null);
    const [galleryFolders, setGalleryFolders] = useState<string[]>([]);
    const [chatGalleryFolder, setChatGalleryFolder] = useState("");

    const refreshGalleryFolders = useCallback(async () => {
        const custom = readStringListSetting(GALLERY_CUSTOM_FOLDERS_KEY);
        try {
            const galleryItems = await loadGalleryItems();
            const fromItems = galleryItems.map(item => item.folder).filter(Boolean) as string[];
            setGalleryFolders(Array.from(new Set([...custom, ...fromItems])).sort());
        } catch {
            setGalleryFolders(custom.sort());
        }
    }, []);

    // Load sessions from localStorage and hydrate images from IndexedDB on mount
    useEffect(() => {
        const saved = storage.getChatHistory();
        const folders = readStringListSetting(CHAT_FOLDERS_KEY);
        setChatFolders(folders);
        setExpandedChatFolders(new Set(["Ungrouped", ...folders]));
        setChatGalleryFolder(storage.get(CHAT_GALLERY_FOLDER_KEY) || "");
        refreshGalleryFolders();
        if (saved.length > 0) {
            setSessions(saved);
            setActiveSessionId(saved[0].id);

            // Collect all message IDs that had images stored in IndexedDB.
            const imageMessageIds = saved.flatMap(s =>
                s.messages.filter(needsImageHydration).map(m => m.id)
            );
            if (imageMessageIds.length > 0) {
                loadImages(imageMessageIds).then(imageMap => {
                    // Rehydrate sessions with real image data from IndexedDB
                    setSessions(prev => prev.map(s => ({
                        ...s,
                        messages: s.messages.map(m =>
                            imageMap[m.id]
                                ? { ...m, imageData: imageMap[m.id][0], attachments: imageMap[m.id] }
                                : m
                        ),
                    })));
                }).catch(err => console.warn("Failed to load images from IndexedDB:", err));
            }
        }
        // Load provider selection
        const selection = getProviderSelection();
        setActiveProvider(selection.provider);
        setSelectedModel(selection.modelId);
        setHasApiKey(hasApiKeyForProvider(selection.provider));
    }, [refreshGalleryFolders]);

    useEffect(() => {
        const handler = () => refreshGalleryFolders();
        window.addEventListener(GALLERY_CHANGED_EVENT, handler);
        window.addEventListener(GALLERY_FOLDERS_CHANGED_EVENT, handler);
        return () => {
            window.removeEventListener(GALLERY_CHANGED_EVENT, handler);
            window.removeEventListener(GALLERY_FOLDERS_CHANGED_EVENT, handler);
        };
    }, [refreshGalleryFolders]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "0px";
        const nextHeight = Math.min(textarea.scrollHeight, CHAT_TEXTAREA_MAX_HEIGHT);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > CHAT_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
    }, [inputText]);

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
            const allImgIds = session.messages.filter(hasStoredMessageImages).map(m => m.id);
            deleteImages(allImgIds).catch(err => console.warn("Failed to delete images from IndexedDB:", err));
        }
        const updated = sessions.filter((s) => s.id !== id);
        persistSessions(updated);
        if (activeSessionId === id) {
            setActiveSessionId(updated.length > 0 ? updated[0].id : null);
        }
    };

    const handleCreateChatFolder = () => {
        const name = prompt("New chat folder name:");
        const trimmed = name?.trim();
        if (!trimmed || chatFolders.includes(trimmed)) return;
        const next = [...chatFolders, trimmed].sort();
        setChatFolders(next);
        setExpandedChatFolders(prev => new Set([...prev, trimmed]));
        writeStringListSetting(CHAT_FOLDERS_KEY, next);
    };

    const moveChatToFolder = useCallback((chatId: string, folder?: string) => {
        const updated = sessions.map(s => s.id === chatId ? { ...s, folder, updatedAt: Date.now() } : s);
        persistSessions(updated);
    }, [sessions, persistSessions]);

    const handleRenameChatFolder = (oldName: string) => {
        const name = prompt(`Rename chat folder "${oldName}":`, oldName);
        const trimmed = name?.trim();
        if (!trimmed || trimmed === oldName || chatFolders.includes(trimmed)) return;
        const nextFolders = chatFolders.map(f => f === oldName ? trimmed : f).sort();
        setChatFolders(nextFolders);
        writeStringListSetting(CHAT_FOLDERS_KEY, nextFolders);
        setExpandedChatFolders(prev => {
            const next = new Set(prev);
            if (next.delete(oldName)) next.add(trimmed);
            return next;
        });
        persistSessions(sessions.map(s => s.folder === oldName ? { ...s, folder: trimmed } : s));
    };

    const handleDeleteChatFolder = (folder: string) => {
        if (!confirm(`Delete chat folder "${folder}"? Chats will move to Ungrouped.`)) return;
        const nextFolders = chatFolders.filter(f => f !== folder);
        setChatFolders(nextFolders);
        writeStringListSetting(CHAT_FOLDERS_KEY, nextFolders);
        persistSessions(sessions.map(s => s.folder === folder ? { ...s, folder: undefined } : s));
    };

    const toggleChatFolder = (folder: string) => {
        setExpandedChatFolders(prev => {
            const next = new Set(prev);
            if (next.has(folder)) next.delete(folder); else next.add(folder);
            return next;
        });
    };

    const handleCreateGalleryFolderForChat = () => {
        const name = prompt("New gallery folder name:");
        const trimmed = name?.trim();
        if (!trimmed) return;
        const next = Array.from(new Set([...readStringListSetting(GALLERY_CUSTOM_FOLDERS_KEY), trimmed])).sort();
        writeStringListSetting(GALLERY_CUSTOM_FOLDERS_KEY, next);
        setGalleryFolders(prev => Array.from(new Set([...prev, trimmed])).sort());
        setChatGalleryFolder(trimmed);
        storage.set(CHAT_GALLERY_FOLDER_KEY, trimmed);
        notifyGalleryFoldersChanged();
    };

    const chatFolderGroups = useMemo(() => {
        const groups = new Map<string, ChatSession[]>();
        for (const folder of chatFolders) groups.set(folder, []);
        groups.set("Ungrouped", []);
        for (const session of sessions) {
            const folder = session.folder && chatFolders.includes(session.folder) ? session.folder : "Ungrouped";
            if (!groups.has(folder)) groups.set(folder, []);
            groups.get(folder)!.push(session);
        }
        return groups;
    }, [sessions, chatFolders]);

    const handleSend = async () => {
        if ((!inputText.trim() && attachedImages.length === 0) || isLoading) return;

        const apiKey = getApiKeyForProvider(activeProvider);
        if (!apiKey) {
            const providerName = activeProvider === "gemini" ? "Gemini" : "Fal.ai";
            setError(`No ${providerName} API key. Go to Settings to add one.`);
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
        const userMsg = createMessage("user", inputText, attachedImages);
        session = {
            ...session,
            messages: [...session.messages, userMsg],
            updatedAt: Date.now(),
            title: session.messages.length === 0 ? inputText.slice(0, 30) || "Image chat" : session.title,
        };
        currentSessions = currentSessions.map((s) => (s.id === session!.id ? session! : s));
        persistSessions(currentSessions);

        // Save user attachments to IndexedDB
        if (attachedImages.length > 0) {
            saveImage(userMsg.id, attachedImages).catch(err =>
                console.warn("Failed to save user images to IndexedDB:", err));
        }

        const messageText = inputText;
        const messageImages = attachedImages;
        setInputText("");
        setAttachedImages([]);
        setIsLoading(true);
        setError(null);
        abortRef.current = false;

        try {
            let response: { text: string; imageData?: string; error?: string };
            let modelForOutput = selectedModel;

            if (activeProvider === "fal") {
                // Fal.ai path — no multi-turn chat, standalone generation
                const falConfig: FalChatConfig = {
                    model: selectedModel,
                    resolution: resolution,
                    ratio: aspectRatio,
                };
                response = await sendFalMessage(apiKey, messageText, messageImages, falConfig);
            } else {
                // Gemini path (default)
                // If genImage is off, force flash model (text-only)
                const effectiveModel = genImage ? selectedModel : GEMINI_MODELS.find(m => !m.supportsImages)?.id || selectedModel;
                modelForOutput = effectiveModel;

                const config: GeminiConfig = {
                    model: effectiveModel,
                    resolution: resolution,
                    ratio: aspectRatio,
                };

                response = await sendGeminiMessage(
                    apiKey,
                    session.messages.slice(0, -1),
                    messageText,
                    messageImages,
                    config,
                );
            }

            if (abortRef.current) return;

            if (response.error) {
                setError(response.error);
                return;
            }

            // Add model response
            const modelImages = response.imageData ? [response.imageData] : undefined;
            const modelMsg = createMessage("model", response.text, modelImages);
            const updatedSession = {
                ...session,
                messages: [...session.messages, modelMsg],
                updatedAt: Date.now(),
            };
            const finalSessions = currentSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s));
            persistSessions(finalSessions);

            // Save model's generated image to IndexedDB
            if (response.imageData) {
                saveImage(modelMsg.id, [response.imageData]).catch(err =>
                    console.warn("Failed to save model image to IndexedDB:", err));

                // Also save to gallery
                saveGalleryItem({
                    id: crypto.randomUUID(),
                    dataUrl: response.imageData,
                    prompt: withModelName(messageText || "Image generation", modelForOutput),
                    folder: chatGalleryFolder || undefined,
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

    const appendImageFiles = useCallback(async (files: File[]) => {
        const imageFiles = files.filter((file) => file.type.startsWith("image/"));
        if (imageFiles.length === 0) {
            setError("Only image files can be attached in chat");
            return;
        }

        const remainingSlots = CHAT_ATTACHMENT_LIMIT - attachedImages.length;
        const filesToRead = imageFiles.slice(0, Math.max(remainingSlots, 0));

        if (remainingSlots <= 0) {
            setError(`You can attach up to ${CHAT_ATTACHMENT_LIMIT} images in chat.`);
            return;
        }

        try {
            const base64Images = await Promise.all(filesToRead.map(fileToBase64));
            setAttachedImages((prev) => [...prev, ...base64Images]);
            if (files.length > imageFiles.length) {
                setError("Some dropped files were ignored because they are not images.");
            } else if (imageFiles.length > filesToRead.length) {
                setError(`Only the first ${CHAT_ATTACHMENT_LIMIT} images are kept in chat.`);
            }
        } catch {
            setError("Failed to read one or more image files");
        }
    }, [attachedImages.length]);

    const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        await appendImageFiles(files);
        // Reset input so same file can be selected again
        e.target.value = "";
    };

    const handleStop = () => {
        abortRef.current = true;
        setIsLoading(false);
    };

    const handleComposerDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragCounterRef.current += 1;
        setIsDraggingFiles(true);
    };

    const handleComposerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!isDraggingFiles) {
            setIsDraggingFiles(true);
        }
    };

    const handleComposerDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
        if (dragCounterRef.current === 0) {
            setIsDraggingFiles(false);
        }
    };

    const handleComposerDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDraggingFiles(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length === 0) return;
        await appendImageFiles(files);
    };

    return (
        <PageShell title="Chat" subtitle="AI conversation with image generation" icon={MessageSquare}>
            <div className="flex h-full p-6 gap-4">
                {/* Sidebar */}
                <aside className="w-52 flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2">
                        <button onClick={handleNewChat}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition-all duration-200 active:scale-[0.97]">
                            <Plus size={14} /> New Chat
                        </button>
                        <Tooltip label="Create a chat folder. Drag chats into folders to keep projects separate.">
                            <button onClick={handleCreateChatFolder}
                                className="px-2.5 h-full rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-card-hover transition-all duration-200"
                                title="New chat folder">
                                <FolderPlus size={14} />
                            </button>
                        </Tooltip>
                    </div>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-1">
                        {Array.from(chatFolderGroups.entries()).map(([folder, folderSessions]) => {
                            if (folder === "Ungrouped" && folderSessions.length === 0 && chatFolders.length > 0) return null;
                            const isExpanded = expandedChatFolders.has(folder);
                            const isCustomFolder = folder !== "Ungrouped";
                            const isDropTarget = dragChatId !== null;

                            return (
                                <div key={folder}
                                    className={`rounded-lg border transition-all duration-150 ${isDropTarget ? "border-accent/20" : "border-transparent"}`}
                                    onDragOver={(e) => { e.preventDefault(); }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const chatId = dragChatId || e.dataTransfer.getData("text/plain");
                                        if (chatId) moveChatToFolder(chatId, isCustomFolder ? folder : undefined);
                                        setDragChatId(null);
                                    }}>
                                    <div className="group flex items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors">
                                        <button onClick={() => toggleChatFolder(folder)}
                                            className="flex-1 flex items-center gap-2 min-w-0 px-2 py-1.5 text-left">
                                            <ChevronRight size={12}
                                                className={`shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                                            <FolderOpen size={13} className="shrink-0 text-accent/70" />
                                            <span className="text-[11px] font-medium truncate">{folder}</span>
                                            <span className="ml-auto text-[9px] text-muted-foreground/60">{folderSessions.length}</span>
                                        </button>
                                        {isCustomFolder && (
                                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Tooltip label="Rename this chat folder.">
                                                    <button onClick={() => handleRenameChatFolder(folder)}
                                                        className="px-1.5 py-1.5 hover:text-foreground" title="Rename folder">
                                                        <MoreVertical size={10} />
                                                    </button>
                                                </Tooltip>
                                                <Tooltip label="Delete the folder. Chats inside move back to Ungrouped.">
                                                    <button onClick={() => handleDeleteChatFolder(folder)}
                                                        className="px-1.5 py-1.5 hover:text-red-400" title="Delete folder">
                                                        <Trash2 size={10} />
                                                    </button>
                                                </Tooltip>
                                            </div>
                                        )}
                                    </div>

                                    {isExpanded && (
                                        <div className="flex flex-col gap-0.5 pl-3">
                                            {folderSessions.map((s) => (
                                                <div key={s.id}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDragChatId(s.id);
                                                        e.dataTransfer.setData("text/plain", s.id);
                                                        e.dataTransfer.effectAllowed = "move";
                                                    }}
                                                    onDragEnd={() => setDragChatId(null)}
                                                    className={`group flex items-center rounded-lg transition-all duration-150
                                                        ${s.id === activeSessionId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                                                        ${dragChatId === s.id ? "opacity-50" : ""}`}>
                                                    <button onClick={() => { setActiveSessionId(s.id); setError(null); }}
                                                        className="flex-1 text-left px-3 py-2 text-sm truncate">{s.title}</button>
                                                    <button onClick={() => handleDeleteChat(s.id)}
                                                        className="px-2 py-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all duration-200">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            {folderSessions.length === 0 && (
                                                <div className="px-3 py-2 text-[10px] text-muted-foreground/35">Drop chats here</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {sessions.length === 0 && (
                            <p className="text-xs text-muted-foreground/40 text-center mt-8">No chats yet</p>
                        )}
                    </div>
                </aside>

                {/* Main chat area */}
                <div
                    className="relative flex-1 flex flex-col min-w-0"
                    onDragEnter={handleComposerDragEnter}
                    onDragOver={handleComposerDragOver}
                    onDragLeave={handleComposerDragLeave}
                    onDrop={handleComposerDrop}
                >
                    {/* Messages */}
                    <div className={`flex-1 overflow-y-auto px-2 transition-all duration-200 ${isDraggingFiles ? "bg-accent/5" : ""}`}>
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
                    {isDraggingFiles && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                            <div className="w-full max-w-2xl rounded-2xl border border-accent/40 bg-card/92 px-8 py-12 text-center shadow-2xl backdrop-blur-sm">
                                <div className="text-sm font-medium text-foreground">Drop images into chat</div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                    Up to {CHAT_ATTACHMENT_LIMIT} reference images will be attached to the next message
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mx-2 mb-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs max-w-3xl self-center w-full">
                            <AlertCircle size={14} className="shrink-0" />
                            <span className="flex-1">{error}</span>
                            <button onClick={() => setError(null)} className="hover:text-red-300"><X size={12} /></button>
                        </div>
                    )}

                    {/* Attached image preview */}
                    {attachedImages.length > 0 && (
                        <div className="mx-2 mb-2 max-w-3xl self-center w-full">
                            <div className="rounded-xl bg-muted p-2.5">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                        {attachedImages.length} image{attachedImages.length !== 1 ? "s" : ""} attached
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/50">
                                        {attachedImages.length}/{CHAT_ATTACHMENT_LIMIT}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {attachedImages.map((image, index) => (
                                        <div key={`${index}-${image.slice(0, 32)}`} className="relative">
                                            <img src={image} alt={`attachment ${index + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                                            <button
                                                onClick={() => setAttachedImages((prev) => prev.filter((_, imgIndex) => imgIndex !== index))}
                                                className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 p-1 text-white transition-colors hover:bg-black"
                                                title="Remove image"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="border-t border-border pt-3 pb-3 px-2">
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-end gap-2">
                                <div
                                    className="flex-1 flex items-end rounded-xl border border-transparent bg-muted px-4 py-2.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-accent/30"
                                >
                                    <textarea
                                        ref={textareaRef}
                                        placeholder="Type a message..."
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        rows={1}
                                        className="max-h-[180px] min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/40"
                                    />
                                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileAttach} />
                                    <Tooltip label={`Attach up to ${CHAT_ATTACHMENT_LIMIT} reference images for the model to analyze or edit.`}>
                                        <button onClick={() => fileInputRef.current?.click()}
                                            className="ml-2 text-muted-foreground transition-colors duration-200 hover:text-foreground" title="Attach image">
                                            <Paperclip size={18} />
                                        </button>
                                    </Tooltip>
                                </div>
                                {isLoading ? (
                                    <Tooltip label="Stop the current request. Already returned text or images stay in the chat.">
                                        <button onClick={handleStop} className="p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 active:scale-95" title="Stop">
                                            <StopCircle size={16} />
                                        </button>
                                    </Tooltip>
                                ) : (
                                    <Tooltip label={genImage ? "Send the prompt and generate an image." : "Send the message to chat."}>
                                        <button onClick={handleSend}
                                            disabled={!inputText.trim() && attachedImages.length === 0}
                                            className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                                            <Send size={16} />
                                        </button>
                                    </Tooltip>
                                )}
                            </div>
                            {/* Toolbar: Gen Image toggle, Model, Resolution, Ratio */}
                            <div className="flex items-center gap-3 mt-2 px-1 relative">
                                {/* Gen Image toggle */}
                                <Tooltip label="Turn this on when the next message should create an image and save it to Gallery.">
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={genImage} onChange={(e) => setGenImage(e.target.checked)} className="rounded accent-accent w-3.5 h-3.5" />
                                        <span className="text-xs text-muted-foreground">Gen Image</span>
                                    </label>
                                </Tooltip>

                                <span className="text-muted-foreground/20">|</span>

                                {/* Model selector with provider groups */}
                                <div className="relative">
                                    <Tooltip label="Choose which model answers this chat or creates the image. Models without a saved key are disabled.">
                                        <button onClick={() => { setShowModelPicker(!showModelPicker); setShowRatioPicker(false); }}
                                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200">
                                            <span className="text-muted-foreground/60">Model:</span>
                                            <span className="font-medium">{getModel(selectedModel)?.label || selectedModel}</span>
                                            <ChevronDown size={10} />
                                        </button>
                                    </Tooltip>
                                    {showModelPicker && (
                                        <div className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[280px] z-50 max-h-80 overflow-y-auto">
                                            {PROVIDERS.map((provider) => (
                                                <div key={provider.slug}>
                                                    <div className="px-4 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/50 font-medium border-b border-border/30">
                                                        {provider.name}
                                                        {!hasApiKeyForProvider(provider.slug) && (
                                                            <span className="ml-1.5 text-yellow-500/60">⚠ no key</span>
                                                        )}
                                                    </div>
                                                    {provider.models.map((m) => (
                                                        <button key={m.id} onClick={() => {
                                                            setActiveProvider(m.provider);
                                                            setSelectedModel(m.id);
                                                            setProviderSelection({ provider: m.provider, modelId: m.id });
                                                            setHasApiKey(hasApiKeyForProvider(m.provider));
                                                            setShowModelPicker(false);
                                                        }}
                                                            disabled={!hasApiKeyForProvider(provider.slug)}
                                                            className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-all duration-150
                                                                ${m.id === selectedModel ? "bg-accent/10 text-accent" : "hover:bg-muted text-foreground"}
                                                                ${!hasApiKeyForProvider(provider.slug) ? "opacity-40 cursor-not-allowed" : ""}`}>
                                                            <span>{m.label}</span>
                                                            <span className="flex gap-1">
                                                                {m.capabilities.imageToImage && <CapabilityBadge type="IMG2IMG" />}
                                                                {m.capabilities.textToImage && <CapabilityBadge type="TXT2IMG" />}
                                                                {m.capabilities.chat && <CapabilityBadge type="CHAT" />}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
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
                                                <Tooltip key={r} label={`${r} output tier. 2K is the default balance for this app.`}>
                                                    <button onClick={() => setResolution(r)}
                                                        className={`px-2 py-0.5 text-[10px] rounded-md transition-all duration-150
                                                            ${resolution === r ? "bg-accent/20 text-accent font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                                                        {r}
                                                    </button>
                                                </Tooltip>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Aspect Ratio (only when genImage) */}
                                {genImage && (
                                    <>
                                        <span className="text-muted-foreground/20">|</span>
                                        <div className="relative">
                                            <Tooltip label="Choose the image shape: square, vertical, wide, and so on.">
                                                <button onClick={() => { setShowRatioPicker(!showRatioPicker); setShowModelPicker(false); }}
                                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200">
                                                    <span className="text-muted-foreground/60">Ratio:</span>
                                                    <span className="font-medium">{aspectRatio}</span>
                                                    <ChevronDown size={10} />
                                                </button>
                                            </Tooltip>
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

                                {/* Gallery destination folder */}
                                {genImage && (
                                    <>
                                        <span className="text-muted-foreground/20">|</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-muted-foreground/60">Save to:</span>
                                            <Tooltip label="Generated chat images will be saved to this Gallery folder by default.">
                                                <select
                                                    value={chatGalleryFolder}
                                                    onChange={(e) => {
                                                        setChatGalleryFolder(e.target.value);
                                                        storage.set(CHAT_GALLERY_FOLDER_KEY, e.target.value);
                                                    }}
                                                    className="max-w-32 bg-muted text-xs text-muted-foreground hover:text-foreground rounded-md px-2 py-0.5 outline-none"
                                                    title="Default gallery folder for generated chat images"
                                                >
                                                    <option value="">Ungrouped</option>
                                                    {galleryFolders.map(folder => (
                                                        <option key={folder} value={folder}>{folder}</option>
                                                    ))}
                                                </select>
                                            </Tooltip>
                                            <Tooltip label="Create a new Gallery folder and use it for generated chat images.">
                                                <button onClick={handleCreateGalleryFolderForChat}
                                                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                    title="New gallery folder">
                                                    <FolderPlus size={12} />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </>
                                )}

                                {/* API key warning */}
                                {!hasApiKey && (
                                    <span className="text-[10px] text-yellow-500/70">⚠ No {activeProvider === "gemini" ? "Gemini" : "Fal.ai"} API key</span>
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

function getImageExtensionFromDataUrl(dataUrl: string): string {
    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const extMap: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    };
    return extMap[mimeType] || ".png";
}

function getBase64Payload(dataUrl: string): string {
    return dataUrl.split(",")[1] || "";
}

function safeFilename(name: string): string {
    return (name || "image")
        .replace(/[^a-zA-Z0-9_\-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        || "image";
}

function uniquePath(path: string, used: Set<string>): string {
    if (!used.has(path)) {
        used.add(path);
        return path;
    }

    const dot = path.lastIndexOf(".");
    const base = dot >= 0 ? path.slice(0, dot) : path;
    const ext = dot >= 0 ? path.slice(dot) : "";
    let n = 2;
    let next = `${base}_${n}${ext}`;
    while (used.has(next)) {
        n += 1;
        next = `${base}_${n}${ext}`;
    }
    used.add(next);
    return next;
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 5000);
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
    const images = getMessageImages(message);
    const hasPendingImagePlaceholder = images.length === 0 && needsImageHydration(message);

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${isUser
                ? "bg-user-bubble border border-border rounded-br-md"
                : "bg-card border border-border rounded-bl-md"}`}>
                {message.text && (
                    <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isUser ? "text-user-bubble-text" : "text-foreground"}`}>{message.text}</p>
                )}
                {images.length > 0 && (
                    <div className={`mt-2 grid gap-2 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {images.map((image, index) => (
                            <div key={`${message.id}-${index}`} className="relative group">
                                <img src={image} alt={`Attachment ${index + 1}`}
                                    className="rounded-lg max-h-80 w-auto cursor-pointer hover:brightness-110 transition-all duration-200"
                                    onClick={() => onImageClick?.(image)} />
                                <button onClick={() => downloadBase64Image(image, `nanopapl_${new Date(message.timestamp).toISOString().slice(0, 10)}_${message.id.slice(0, 6)}_${index + 1}.png`)}
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70">
                                    <Download size={14} className="text-white" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {hasPendingImagePlaceholder && (
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
    const [tileSize, setTileSize] = useState<TileSize>("L");
    const [viewMode, setViewMode] = useState<GalleryViewMode>("folders");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [starredFilter, setStarredFilter] = useState(false);
    const [customFolders, setCustomFolders] = useState<string[]>([]);
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    // Multi-select state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [isExportingZip, setIsExportingZip] = useState(false);

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

    // Hydrate preferences after mount to keep server/client first render identical.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setTileSize((storage.get("gallery_tile_size") as TileSize) || "L");
            const savedViewMode = storage.get("gallery_view_mode") as GalleryViewMode | null;
            const folderDefaultKey = "gallery_folder_default_applied";
            if (!storage.get(folderDefaultKey) && (!savedViewMode || savedViewMode === "flat")) {
                storage.set(folderDefaultKey, "1");
                setViewMode("folders");
            } else {
                setViewMode(savedViewMode || "folders");
            }
            try {
                setCustomFolders(readStringListSetting(GALLERY_CUSTOM_FOLDERS_KEY));
            } catch {
                setCustomFolders([]);
            }
            setPrefsLoaded(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    // Persist preferences
    useEffect(() => { if (prefsLoaded) storage.set("gallery_tile_size", tileSize); }, [tileSize, prefsLoaded]);
    useEffect(() => { if (prefsLoaded) storage.set("gallery_view_mode", viewMode); }, [viewMode, prefsLoaded]);
    useEffect(() => { if (prefsLoaded) writeStringListSetting(GALLERY_CUSTOM_FOLDERS_KEY, customFolders); }, [customFolders, prefsLoaded]);
    useEffect(() => {
        const handler = () => setCustomFolders(readStringListSetting(GALLERY_CUSTOM_FOLDERS_KEY));
        window.addEventListener(GALLERY_FOLDERS_CHANGED_EVENT, handler);
        return () => window.removeEventListener(GALLERY_FOLDERS_CHANGED_EVENT, handler);
    }, []);

    const refresh = useCallback(() => {
        setLoading(true);
        loadGalleryItems()
            .then(setItems)
            .catch(err => console.warn("Failed to load gallery:", err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(refresh, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

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
        downloadBase64Image(item.dataUrl, safeFilename(item.prompt));
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
            window.setTimeout(notifyGalleryFoldersChanged, 0);
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
                window.setTimeout(notifyGalleryFoldersChanged, 0);
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
                window.setTimeout(notifyGalleryFoldersChanged, 0);
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

    const handleBatchDownload = useCallback(async () => {
        const selected = items.filter(i => selectedIds.has(i.id));
        if (selected.length === 0 || isExportingZip) return;

        setIsExportingZip(true);
        try {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            const usedPaths = new Set<string>();

            for (const item of selected) {
                const folder = item.folder ? `${safeFilename(item.folder)}/` : "";
                const filename = `${safeFilename(item.prompt)}${getImageExtensionFromDataUrl(item.dataUrl)}`;
                const path = uniquePath(`${folder}${filename}`, usedPaths);
                zip.file(path, getBase64Payload(item.dataUrl), { base64: true });
            }

            const blob = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 },
            });
            downloadBlob(blob, `nano-papl-gallery_${selected.length}_images_${Date.now()}.zip`);
        } catch (err) {
            console.error("ZIP export failed:", err);
            alert("Failed to create ZIP archive.");
        } finally {
            setIsExportingZip(false);
        }
    }, [items, selectedIds, isExportingZip]);

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
            <PageShell title="Gallery" subtitle="Generated images" icon={ImageIcon}>
                <div className="flex items-center justify-center h-full">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
            </PageShell>
        );
    }

    if (items.length === 0) {
        return (
            <PageShell title="Gallery" subtitle="Generated images" icon={ImageIcon}>
                <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
                        <ImageIcon size={32} className="text-muted-foreground/30" />
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
                <Tooltip
                    label={item.starred ? "Remove this image from favorites." : "Mark this image as a favorite."}
                    className={`absolute top-1.5 left-1.5 transition-all duration-200 ${item.starred ? "" : "opacity-0 group-hover:opacity-100"}`}
                >
                    <button onClick={(e) => { e.stopPropagation(); handleToggleStar(item); }}
                        className={`p-1 rounded-md transition-all duration-200 ${item.starred ? "text-yellow-400 bg-black/40" : "text-white/50 bg-black/30"}`}
                        title={item.starred ? "Unstar" : "Star"}>
                        <Star size={tileSize === "S" ? 10 : 12} fill={item.starred ? "currentColor" : "none"} />
                    </button>
                </Tooltip>
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
                <Tooltip label="Download this image.">
                    <button onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                        className="p-1 rounded-md bg-black/60 hover:bg-black/80 transition-colors" title="Download">
                        <Download size={tileSize === "S" ? 10 : 12} className="text-white" />
                    </button>
                </Tooltip>
                <Tooltip label="Open image actions: move, star, download, or delete.">
                    <button onClick={(e) => { e.stopPropagation(); setTileMenu({ x: e.clientX, y: e.clientY, item }); }}
                        className="p-1 rounded-md bg-black/60 hover:bg-black/80 transition-colors" title="More">
                        <MoreVertical size={tileSize === "S" ? 10 : 12} className="text-white" />
                    </button>
                </Tooltip>
            </div>
            )}
        </div>
        );
    };

    const starCount = items.filter(i => i.starred).length;

    return (
        <PageShell title="Gallery" subtitle={`${items.length} image${items.length !== 1 ? "s" : ""}`} icon={ImageIcon}>
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
                                <Tooltip label={selectedItem.starred ? "Remove this image from favorites." : "Mark this image as a favorite."}>
                                    <button onClick={() => handleToggleStar(selectedItem)}
                                        className={`p-2 rounded-lg transition-colors ${selectedItem.starred ? "bg-yellow-500/20 text-yellow-400" : "bg-white/10 hover:bg-white/20 text-white/60"}`}
                                        title={selectedItem.starred ? "Unstar" : "Star"}>
                                        <Star size={16} fill={selectedItem.starred ? "currentColor" : "none"} />
                                    </button>
                                </Tooltip>
                                <Tooltip label="Download this image.">
                                    <button onClick={() => handleDownload(selectedItem)}
                                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Download">
                                        <Download size={16} className="text-white" />
                                    </button>
                                </Tooltip>
                                <Tooltip label="Delete this image from local Gallery storage.">
                                    <button onClick={() => handleDelete(selectedItem.id)}
                                        className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors" title="Delete">
                                        <Trash2 size={16} className="text-red-400" />
                                    </button>
                                </Tooltip>
                                <Tooltip label="Close preview and return to Gallery.">
                                    <button onClick={() => setSelectedItem(null)}
                                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Close">
                                        <X size={16} className="text-white" />
                                    </button>
                                </Tooltip>
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
                            <Tooltip label="Leave multi-select mode without changing images.">
                                <button onClick={exitSelectionMode}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title="Exit selection">
                                    <XCircle size={12} /> Cancel
                                </button>
                            </Tooltip>
                            <span className="text-xs text-muted-foreground">
                                {selectedIds.size} selected
                            </span>
                            <Tooltip label="Select every visible image in the current filter or folder view.">
                                <button onClick={selectAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                    <CheckSquare size={12} /> Select All
                                </button>
                            </Tooltip>
                            {selectedIds.size > 0 && (
                                <Tooltip label="Clear the current image selection.">
                                    <button onClick={deselectAll}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                        <Square size={12} /> Deselect
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Batch star */}
                            {selectedIds.size > 0 && (
                                <Tooltip label="Mark all selected images as favorites.">
                                    <button onClick={() => handleBatchStar(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                                        title="Star selected">
                                        <Star size={12} fill="currentColor" /> Star
                                    </button>
                                </Tooltip>
                            )}
                            {/* Batch download */}
                            {selectedIds.size > 0 && (
                                <Tooltip label="Pack selected Gallery images into one ZIP file and download it.">
                                    <button onClick={handleBatchDownload}
                                        disabled={isExportingZip}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-wait"
                                        title="Download selected images as ZIP">
                                        {isExportingZip
                                            ? <Loader2 size={12} className="animate-spin" />
                                            : <Download size={12} />}
                                        {isExportingZip ? "Zipping..." : "Download ZIP"}
                                    </button>
                                </Tooltip>
                            )}
                            {/* Batch move to folder */}
                            {selectedIds.size > 0 && (
                                <div className="relative" ref={moveMenuRef}>
                                    <Tooltip label="Move selected images into an existing or new Gallery folder.">
                                        <button onClick={() => setShowMoveMenu(!showMoveMenu)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                                            title="Move selected to folder">
                                            <FolderOpen size={12} /> Move to…
                                        </button>
                                    </Tooltip>
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
                                                        window.setTimeout(notifyGalleryFoldersChanged, 0);
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
                                <Tooltip label="Delete all selected images from local Gallery storage.">
                                    <button onClick={handleBatchDelete}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                        title="Delete selected">
                                        <Trash2 size={12} /> Delete
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Normal toolbar ── */
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            {/* View mode toggle */}
                            <Tooltip label={viewMode === "flat" ? "Group Gallery images by folder." : "Show all Gallery images in one grid."}>
                                <button onClick={() => setViewMode(viewMode === "flat" ? "folders" : "flat")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${viewMode === "folders" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                                    title={viewMode === "flat" ? "Switch to folder view" : "Switch to flat view"}>
                                    {viewMode === "flat" ? <FolderOpen size={12} /> : <LayoutGrid size={12} />}
                                    {viewMode === "flat" ? "Folders" : "Flat"}
                                </button>
                            </Tooltip>

                            {/* Star filter */}
                            <Tooltip label={starredFilter ? "Return to all Gallery images." : "Show only favorite images."}>
                                <button onClick={() => setStarredFilter(!starredFilter)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${starredFilter ? "bg-yellow-500/15 text-yellow-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                                    title={starredFilter ? "Show all" : "Show starred only"}>
                                    <Star size={12} fill={starredFilter ? "currentColor" : "none"} />
                                    {starCount > 0 && <span>{starCount}</span>}
                                </button>
                            </Tooltip>

                            {/* Select mode */}
                            <Tooltip label="Select multiple images so you can move, delete, star, or download them together.">
                                <button onClick={() => setSelectionMode(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title="Select multiple images">
                                    <CheckSquare size={12} /> Select
                                </button>
                            </Tooltip>

                            {/* New folder */}
                            {viewMode === "folders" && (
                                <Tooltip label="Create an empty Gallery folder for organizing images.">
                                    <button onClick={handleCreateFolder}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                        title="Create new folder">
                                        <FolderPlus size={12} /> New
                                    </button>
                                </Tooltip>
                            )}

                            {/* Tile size selector */}
                            <div className="flex items-center rounded-lg overflow-hidden border border-border">
                                {(["S", "M", "L"] as TileSize[]).map(size => (
                                    <Tooltip key={size} label={`${size} thumbnail size for the Gallery grid.`}>
                                        <button onClick={() => setTileSize(size)}
                                            className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${tileSize === size ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                                            {size}
                                        </button>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>

                        <Tooltip label="Delete every image in the local Gallery. This asks for confirmation.">
                            <button onClick={handleClearAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={12} /> Clear All
                            </button>
                        </Tooltip>
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
                                            <Tooltip label="Rename or delete this Gallery folder.">
                                                <button onClick={(e) => { e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY, folder }); }}
                                                    className="p-2 mr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                    title="Folder actions">
                                                    <MoreVertical size={14} />
                                                </button>
                                            </Tooltip>
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

function ModelCatalogue() {
    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
                Reference only. Pick the active model directly in Chat or Batch.
            </p>
            <div className="flex flex-col gap-3">
                {PROVIDERS.map((provider) => (
                    <div key={provider.slug} className="rounded-xl bg-muted/60 border border-border/60 overflow-hidden">
                        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                            {provider.name}
                        </div>
                        <div className="flex flex-col">
                            {provider.models.map((model) => (
                                <div key={model.id}
                                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs border-b border-border/30 last:border-b-0">
                                    <span className="text-foreground">{getModelLabel(model.id)}</span>
                                    <span className="flex gap-1 shrink-0">
                                        {model.capabilities.imageToImage && <CapabilityBadge type="IMG2IMG" />}
                                        {model.capabilities.textToImage && <CapabilityBadge type="TXT2IMG" />}
                                        {model.capabilities.chat && <CapabilityBadge type="CHAT" />}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
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
                    if (hasStoredMessageImages(m)) validIds.add(m.id);
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
                {/* ─── Provider Selection ─── */}
                <Section title="Available Models">
                    <ModelCatalogue />
                </Section>

                <Section title="API Keys" action={
                    <Tooltip label="Save API keys in this browser's local storage.">
                        <button onClick={handleSave}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95
                                ${saved ? "bg-green-500/20 text-green-400" : "bg-accent text-white hover:bg-accent-hover"}`}>
                            {saved ? <><Check size={12} /> Saved!</> : <><Save size={12} /> Save Keys</>}
                        </button>
                    </Tooltip>
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
                    <Tooltip label="Recalculate local browser storage usage.">
                        <button onClick={refreshStorageInfo} disabled={loadingSize}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                            {loadingSize ? <Loader2 size={12} className="animate-spin" /> : "Refresh"}
                        </button>
                    </Tooltip>
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
                            <Tooltip label="Remove image blobs that are no longer referenced by any chat message.">
                                <button onClick={handleCleanOrphans} disabled={cleaningOrphans}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-card-hover transition-all duration-200 active:scale-[0.98] disabled:opacity-50">
                                    {cleaningOrphans
                                        ? <Loader2 size={12} className="animate-spin" />
                                        : <Sparkles size={12} />}
                                    Clean Orphaned Images
                                </button>
                            </Tooltip>
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
                                    <Tooltip label="This starts a confirmation step before deleting all local app data.">
                                        <button onClick={() => setShowClearConfirm(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 active:scale-95">
                                            <Trash2 size={12} /> Delete Everything
                                        </button>
                                    </Tooltip>
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

                <p className="pb-2 text-center text-[10px] text-muted-foreground/50">
                    {APP_VERSION}
                </p>
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
