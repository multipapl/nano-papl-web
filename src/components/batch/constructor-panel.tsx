"use client";

import { useState, useEffect, useCallback } from "react";
import {
    SlidersHorizontal, RotateCcw, Check, Sun, CloudRain,
    Moon, Sunrise, Sunset, Clock, TreePine, Save, Trash2,
    ChevronDown, Eye,
} from "lucide-react";
import { buildPromptVariants, countActiveVariants, type ConstructorState, type SeasonState, type LightCellState } from "@/lib/batch/prompt-builder";
import { storage } from "@/lib/storage";

// ─── Templates (mirrors templates.json) ───

export const TEMPLATES = {
    input_types: {
        Viewport: "Turn this viewport screenshot from Blender 3D to photorealistic architecture photography. Keep composition, architecture shape and materials basics. Keep aspect ratio and camera angle. Strictly adhere to the geometry.",
        Render: "Retouch this architectural image. Change the season and atmosphere entirely. Keep the architectural structure and composition. Keep aspect ratio.",
    },
    scene_types: {
        Exterior: "Focus on the building's integration with the landscape and environment.",
        Interior: "Focus on interior lighting, materials, and cozy atmosphere.",
    },
    seasons: {
        Winter: "Change season to Winter.",
        Autumn: "Change season to Autumn.",
        Summer: "Change season to Summer.",
        Spring: "Change season to Spring.",
    } as Record<string, string>,
    default_atmospheres: {
        Winter: "Atmosphere: Cold, snowy. No icicle on the roof.",
        Autumn: "Atmosphere: Natural mix of the colors on the vegetation, moody, wet asphalt.",
        Summer: "Atmosphere: Lush green vegetation, clear air, vibrant colors.",
        Spring: "Atmosphere: Fresh crisp air, blossoming vegetation, young light green leaves.",
    } as Record<string, string>,
    christmas_desc: "Elegant minimalistic Christmas decorations in the interiors and street.",
    lighting: {
        Daylight: "Lighting: Natural bright daylight, sharp sun shadows.",
        Overcast: "Lighting: Overcast cold diffused light, no harsh shadows.",
        "Blue Hour": "Lighting: Blue Hour. Deep blue twilight sky, interior lights on.",
        Night: "Lighting: Night. Dark sky, emphasis on artificial lighting.",
        Sunrise: "Lighting: Sunrise. Pale cool low angle sunlight, soft long shadows, bright horizon",
        Sunset: "Lighting: Golden hour. Strong warm low angle sunlight, clear blue sky, sharp deep cool shadows, architectural contrast.",
    } as Record<string, string>,
    global_rules: "Adapt vegetation and materials to the weather conditions. No snow inside the buildings.",
    camera: "Shot on 24mm lens. Deep depth of field, sharp focus throughout, f/8. Cinematic lighting, photorealistic.",
};

const LIGHTING_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    Daylight: Sun,
    Overcast: CloudRain,
    "Blue Hour": Clock,
    Night: Moon,
    Sunrise: Sunrise,
    Sunset: Sunset,
};

export const SEASON_ORDER = ["Winter", "Autumn", "Summer", "Spring"];
export const LIGHTING_ORDER = Object.keys(TEMPLATES.lighting);

// ─── Default state factory ───

export function createDefaultConstructorState(): ConstructorState {
    const defaultLights: Record<string, LightCellState> = {};
    for (const l of LIGHTING_ORDER) {
        defaultLights[l] = { active: true, descOverride: "", atmosphere: "", xmas: false };
    }
    const seasons: Record<string, SeasonState> = {};
    for (const s of SEASON_ORDER) {
        seasons[s] = {
            active: true,
            description: TEMPLATES.seasons[s] || "",
            atmosphere: TEMPLATES.default_atmospheres[s] || "",
            lights: JSON.parse(JSON.stringify(defaultLights)),
        };
    }
    return {
        projectName: "New_Project",
        context: "",
        inputType: "Viewport",
        sceneType: "Exterior",
        basePrompt: `${TEMPLATES.input_types.Viewport} ${TEMPLATES.scene_types.Exterior}`,
        lightingDefs: { ...TEMPLATES.lighting },
        xmasSuffix: TEMPLATES.christmas_desc,
        globalRules: TEMPLATES.global_rules,
        camera: TEMPLATES.camera,
        seasons,
    };
}

// ─── Presets ───

interface ConstructorPreset {
    id: string;
    name: string;
    state: ConstructorState;
    createdAt: number;
}

const PRESETS_KEY = "constructor_presets";

function loadPresets(): ConstructorPreset[] {
    try {
        const raw = storage.get(PRESETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function savePresets(presets: ConstructorPreset[]) {
    storage.set(PRESETS_KEY, JSON.stringify(presets));
}

// ─── Component ───

interface ConstructorPanelProps {
    state: ConstructorState;
    onChange: (s: ConstructorState) => void;
    onClose: () => void;
}

export function ConstructorPanel({ state, onChange, onClose }: ConstructorPanelProps) {
    const [activeSeason, setActiveSeason] = useState("Winter");
    const [presets, setPresets] = useState<ConstructorPreset[]>(loadPresets);
    const [showPresets, setShowPresets] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [showPromptPreview, setShowPromptPreview] = useState(false);

    const update = <K extends keyof ConstructorState>(key: K, val: ConstructorState[K]) => {
        onChange({ ...state, [key]: val });
    };
    const updateSeason = (sName: string, patch: Partial<SeasonState>) => {
        const newSeasons = { ...state.seasons, [sName]: { ...state.seasons[sName], ...patch } };
        onChange({ ...state, seasons: newSeasons });
    };
    const updateLightCell = (sName: string, lName: string, patch: Partial<LightCellState>) => {
        const season = state.seasons[sName];
        const newLights = { ...season.lights, [lName]: { ...season.lights[lName], ...patch } };
        updateSeason(sName, { lights: newLights });
    };
    const updateLightDef = (lName: string, val: string) => {
        update("lightingDefs", { ...state.lightingDefs, [lName]: val });
    };
    const resetAll = () => onChange(createDefaultConstructorState());
    const refreshBasePrompt = (inputType: string, sceneType: string) => {
        const newBase = `${TEMPLATES.input_types[inputType as keyof typeof TEMPLATES.input_types] || ""} ${TEMPLATES.scene_types[sceneType as keyof typeof TEMPLATES.scene_types] || ""}`;
        onChange({ ...state, inputType, sceneType, basePrompt: newBase });
    };

    // ─── Preset handlers ───

    const handleSavePreset = useCallback(() => {
        if (!newPresetName.trim()) return;
        const preset: ConstructorPreset = {
            id: crypto.randomUUID(),
            name: newPresetName.trim(),
            state: JSON.parse(JSON.stringify(state)),
            createdAt: Date.now(),
        };
        const updated = [...presets, preset];
        setPresets(updated);
        savePresets(updated);
        setNewPresetName("");
    }, [newPresetName, state, presets]);

    const handleLoadPreset = useCallback((preset: ConstructorPreset) => {
        onChange(JSON.parse(JSON.stringify(preset.state)));
        setShowPresets(false);
    }, [onChange]);

    const handleDeletePreset = useCallback((id: string) => {
        const updated = presets.filter((p) => p.id !== id);
        setPresets(updated);
        savePresets(updated);
    }, [presets]);

    const variantCount = countActiveVariants(state);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                    <SlidersHorizontal size={18} className="text-accent" />
                    <h2 className="text-sm font-semibold">Prompt Constructor</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                        {variantCount} variant{variantCount !== 1 ? "s" : ""}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Presets dropdown */}
                    <div className="relative">
                        <button onClick={() => setShowPresets(!showPresets)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200">
                            <Save size={12} /> Presets <ChevronDown size={10} />
                        </button>
                        {showPresets && (
                            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl py-2 min-w-[240px] z-50">
                                <div className="px-3 pb-2 mb-2 border-b border-border">
                                    <div className="flex gap-1.5">
                                        <input
                                            type="text"
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); }}
                                            placeholder="Preset name..."
                                            className="flex-1 bg-muted rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent/30"
                                        />
                                        <button
                                            onClick={handleSavePreset}
                                            disabled={!newPresetName.trim()}
                                            className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent-hover transition-all disabled:opacity-30"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                                {/* Default preset */}
                                <button
                                    onClick={() => { onChange(createDefaultConstructorState()); setShowPresets(false); }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                                >
                                    <RotateCcw size={10} className="text-muted-foreground" />
                                    <span>Default Template</span>
                                </button>
                                {/* Custom presets */}
                                {presets.map((p) => (
                                    <div key={p.id} className="flex items-center px-3 py-2 hover:bg-muted transition-colors group">
                                        <button
                                            onClick={() => handleLoadPreset(p)}
                                            className="flex-1 text-left text-xs text-foreground"
                                        >
                                            {p.name}
                                        </button>
                                        <button
                                            onClick={() => handleDeletePreset(p.id)}
                                            className="p-1 text-muted-foreground/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                ))}
                                {presets.length === 0 && (
                                    <p className="px-3 py-2 text-[10px] text-muted-foreground/40 italic">No custom presets yet</p>
                                )}
                            </div>
                        )}
                    </div>
                    <button onClick={() => setShowPromptPreview(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200">
                        <Eye size={12} /> Preview
                    </button>
                    <button onClick={resetAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200">
                        <RotateCcw size={12} /> Reset All
                    </button>
                    <button onClick={onClose}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-all duration-200 active:scale-95">
                        <Check size={14} /> Done
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="flex gap-6">
                    {/* Left column */}
                    <div className="w-[400px] shrink-0 flex flex-col gap-5">
                        <Card>
                            <SectionTitle title="Project Info" />
                            <div className="grid grid-cols-2 gap-3">
                                <FieldInput label="Name" value={state.projectName} placeholder="New_Project" onInput={(v) => update("projectName", v)} />
                                <FieldInput label="Context / Location" value={state.context} placeholder="Modern Living Room..." onInput={(v) => update("context", v)} />
                            </div>
                        </Card>
                        <Card>
                            <SectionTitle title="Scene Configuration" />
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="text-[10px] text-muted-foreground mb-1 block">Input Type</label>
                                    <div className="flex gap-1">
                                        {Object.keys(TEMPLATES.input_types).map((t) => (
                                            <button key={t} onClick={() => refreshBasePrompt(t, state.sceneType)}
                                                className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all duration-200
                                                    ${state.inputType === t ? "bg-accent text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{t}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground mb-1 block">Scene Type</label>
                                    <div className="flex gap-1">
                                        {Object.keys(TEMPLATES.scene_types).map((t) => (
                                            <button key={t} onClick={() => refreshBasePrompt(state.inputType, t)}
                                                className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all duration-200
                                                    ${state.sceneType === t ? "bg-accent text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{t}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-muted-foreground mb-1 block">Base Prompt</label>
                                <textarea value={state.basePrompt} onChange={(e) => update("basePrompt", e.target.value)}
                                    className="w-full h-20 bg-muted rounded-lg px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-accent/30 transition-all duration-200" />
                            </div>
                        </Card>
                        <Card>
                            <SectionTitle title="Global Lighting Definitions" />
                            <div className="flex flex-col gap-1.5">
                                {LIGHTING_ORDER.map((lName) => {
                                    const Icon = LIGHTING_ICONS[lName] || Sun;
                                    return (
                                        <div key={lName} className="flex items-start gap-2">
                                            <div className="flex items-center gap-1.5 w-20 shrink-0 pt-2">
                                                <Icon size={12} className="text-muted-foreground/60" />
                                                <span className="text-[10px] text-muted-foreground">{lName}</span>
                                            </div>
                                            <input type="text" value={state.lightingDefs[lName] || ""} onChange={(e) => updateLightDef(lName, e.target.value)}
                                                className="flex-1 bg-muted rounded-lg px-3 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-200" />
                                            <button onClick={() => updateLightDef(lName, TEMPLATES.lighting[lName] || "")}
                                                className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors duration-200 shrink-0" title="Reset">
                                                <RotateCcw size={10} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                        <Card>
                            <SectionTitle title="Global Settings & Rules" />
                            <div className="flex flex-col gap-2">
                                <FieldInput label="Christmas Suffix" value={state.xmasSuffix} placeholder="Christmas decorations..." onInput={(v) => update("xmasSuffix", v)} />
                                <FieldInput label="Global Rules" value={state.globalRules} placeholder="Rules applied to every prompt..." onInput={(v) => update("globalRules", v)} />
                                <FieldInput label="Camera" value={state.camera} placeholder="Lens, focal length, DOF..." onInput={(v) => update("camera", v)} />
                            </div>
                        </Card>
                    </div>

                    {/* Right: Season Matrix */}
                    <div className="flex-1 flex flex-col gap-4 min-w-0">
                        <Card className="flex-1">
                            <SectionTitle title="Season × Lighting Matrix" />
                            <div className="flex gap-1 mb-4">
                                {SEASON_ORDER.map((s) => {
                                    const isAct = activeSeason === s;
                                    const seasonActive = state.seasons[s]?.active;
                                    return (
                                        <button key={s} onClick={() => setActiveSeason(s)}
                                            className={`px-4 py-1.5 text-xs rounded-lg transition-all duration-200
                                                ${isAct ? "bg-accent text-white" : seasonActive ? "bg-muted text-foreground hover:bg-card-hover" : "bg-muted text-muted-foreground/40 line-through hover:bg-card-hover"}`}>{s}</button>
                                    );
                                })}
                            </div>
                            {(() => {
                                const s = state.seasons[activeSeason];
                                if (!s) return null;
                                return (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-3 bg-muted rounded-xl p-3">
                                            <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                                <input type="checkbox" checked={s.active} onChange={(e) => updateSeason(activeSeason, { active: e.target.checked })} className="rounded accent-accent" />
                                                <span className="text-xs font-medium">Enable {activeSeason}</span>
                                            </label>
                                            <input type="text" value={s.description} onChange={(e) => updateSeason(activeSeason, { description: e.target.value })} placeholder="Season prompt suffix..."
                                                className="flex-1 bg-background rounded-lg px-3 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-200" />
                                            <input type="text" value={s.atmosphere} onChange={(e) => updateSeason(activeSeason, { atmosphere: e.target.value })} placeholder="Atmosphere / extras..."
                                                className="flex-1 bg-background rounded-lg px-3 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-200" />
                                        </div>
                                        <div className="border border-border rounded-xl overflow-hidden">
                                            <div className="grid grid-cols-[40px_28px_80px_1fr_1fr_50px] gap-2 px-3 py-2 bg-muted/50 border-b border-border text-[9px] uppercase tracking-wider text-muted-foreground/60">
                                                <span className="text-center">Act</span>
                                                <span></span>
                                                <span>Type</span>
                                                <span>Description Override</span>
                                                <span>Atmosphere / Extras</span>
                                                <span className="text-center flex items-center gap-0.5 justify-center"><TreePine size={9} /> Xmas</span>
                                            </div>
                                            {LIGHTING_ORDER.map((lName) => {
                                                const cell = s.lights[lName];
                                                if (!cell) return null;
                                                const Icon = LIGHTING_ICONS[lName] || Sun;
                                                return (
                                                    <div key={lName} className={`grid grid-cols-[40px_28px_80px_1fr_1fr_50px] gap-2 px-3 py-2 border-b border-border last:border-b-0 items-center transition-opacity duration-200 ${cell.active ? "" : "opacity-40"}`}>
                                                        <div className="flex justify-center">
                                                            <input type="checkbox" checked={cell.active} onChange={(e) => updateLightCell(activeSeason, lName, { active: e.target.checked })} className="rounded accent-accent" />
                                                        </div>
                                                        <Icon size={14} className="text-muted-foreground/50" />
                                                        <span className="text-xs text-foreground">{lName}</span>
                                                        <input type="text" value={cell.descOverride} onChange={(e) => updateLightCell(activeSeason, lName, { descOverride: e.target.value })}
                                                            placeholder={`Global: ${(state.lightingDefs[lName] || "").slice(0, 40)}...`}
                                                            className="bg-muted rounded-lg px-2.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-200 w-full" />
                                                        <input type="text" value={cell.atmosphere} onChange={(e) => updateLightCell(activeSeason, lName, { atmosphere: e.target.value })} placeholder="Atmosphere..."
                                                            className="bg-muted rounded-lg px-2.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-accent/30 transition-all duration-200 w-full" />
                                                        <div className="flex justify-center">
                                                            <button onClick={() => updateLightCell(activeSeason, lName, { xmas: !cell.xmas })}
                                                                className={`w-8 h-5 rounded-full transition-all duration-200 flex items-center px-0.5 ${cell.xmas ? "bg-green-500/80 justify-end" : "bg-muted-foreground/20 justify-start"}`}>
                                                                <div className="w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-200" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="bg-muted/50 rounded-xl p-3">
                                            <p className="text-[10px] text-muted-foreground">
                                                {activeSeason}: {Object.values(s.lights).filter((l) => l.active).length} of {LIGHTING_ORDER.length} active
                                                {Object.values(s.lights).some((l) => l.xmas) && " · 🎄 Xmas variants"}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </Card>
                    </div>
                </div>
            </div>

            {/* Prompt Preview Modal */}
            {showPromptPreview && (
                <PromptPreviewModal state={state} onClose={() => setShowPromptPreview(false)} />
            )}
        </div>
    );
}

// ─── Prompt Preview Modal ───

function PromptPreviewModal({ state, onClose }: { state: ConstructorState; onClose: () => void }) {
    const variants = buildPromptVariants(state);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <h3 className="text-sm font-semibold">{variants.length} Prompt Variant{variants.length !== 1 ? "s" : ""}</h3>
                    <button onClick={onClose} className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">Close</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                    {variants.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No active variants. Enable seasons and lighting in the matrix.</p>
                    ) : (
                        variants.map((v, i) => (
                            <div key={v.id} className="bg-muted rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] text-muted-foreground/60 font-mono">#{i + 1}</span>
                                    <span className="text-xs font-medium">{v.title}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">{v.season}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground">{v.lighting}</span>
                                    {v.hasXmas && <span className="text-[10px]">🎄</span>}
                                </div>
                                <p className="text-[11px] text-foreground/80 leading-relaxed">{v.prompt}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Shared sub-components ───

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-card border border-border rounded-xl p-4 ${className}`}>{children}</div>;
}

function SectionTitle({ title }: { title: string }) {
    return <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>;
}

function FieldInput({ label, value, placeholder, onInput }: {
    label: string; value: string; placeholder: string; onInput: (v: string) => void;
}) {
    return (
        <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">{label}</label>
            <input type="text" value={value} placeholder={placeholder} onChange={(e) => onInput(e.target.value)}
                className="w-full bg-muted rounded-lg px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/30 focus:ring-1 focus:ring-accent/30 transition-all duration-200" />
        </div>
    );
}
