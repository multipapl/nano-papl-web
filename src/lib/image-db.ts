/**
 * IndexedDB-based image storage for chat messages and gallery.
 * localStorage is limited to ~5MB — IndexedDB can store hundreds of MB.
 *
 * Two object stores:
 *   - "images": chat message images keyed by ChatMessage.id
 *   - "gallery": gallery items with metadata (prompt, source, timestamp)
 */

const DB_NAME = "nanopapl_images";
const DB_VERSION = 2;
const STORE_NAME = "images";
const GALLERY_STORE = "gallery";

// ─── Gallery types ───

export interface GalleryItem {
    id: string;
    dataUrl: string;
    prompt: string;
    source: "chat" | "batch";
    sessionId?: string;
    createdAt: number;
    /** Grouping folder — typically the original input image name (without extension). */
    folder?: string;
    /** Favorites flag. */
    starred?: boolean;
}

// ─── DB helpers ───

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(GALLERY_STORE)) {
                const store = db.createObjectStore(GALLERY_STORE, { keyPath: "id" });
                store.createIndex("createdAt", "createdAt", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ═══════════════════════════════════════
//  Chat image store (existing)
// ═══════════════════════════════════════

/** Save a single image (base64 data URL) keyed by message ID. */
function normalizeStoredImages(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
    if (typeof value === "string" && value.length > 0) {
        return [value];
    }
    return [];
}

export async function saveImage(messageId: string, dataUrl: string | string[]): Promise<void> {
    const images = normalizeStoredImages(dataUrl);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(images, messageId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Load a single image by message ID. Returns null if not found. */
export async function loadImage(messageId: string): Promise<string[] | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(messageId);
        req.onsuccess = () => {
            db.close();
            const images = normalizeStoredImages(req.result);
            resolve(images.length > 0 ? images : null);
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

/** Load multiple images by their message IDs. Returns a map of id → dataUrl. */
export async function loadImages(messageIds: string[]): Promise<Record<string, string[]>> {
    if (messageIds.length === 0) return {};
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const result: Record<string, string[]> = {};
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        let pending = messageIds.length;

        for (const id of messageIds) {
            const req = store.get(id);
            req.onsuccess = () => {
                const images = normalizeStoredImages(req.result);
                if (images.length > 0) result[id] = images;
                pending--;
                if (pending === 0) { db.close(); resolve(result); }
            };
            req.onerror = () => {
                pending--;
                if (pending === 0) { db.close(); resolve(result); }
            };
        }

        // Edge case: empty array handled above, but just in case
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Delete images for given message IDs. */
export async function deleteImages(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        for (const id of messageIds) {
            store.delete(id);
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Delete ALL images from the store. */
export async function clearAllImages(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

// ═══════════════════════════════════════
//  Gallery store (new)
// ═══════════════════════════════════════

// ─── Gallery change event ───

/** Custom event fired whenever the gallery store is mutated. */
export const GALLERY_CHANGED_EVENT = "nanopapl:gallery-changed";

export interface GalleryChangedDetail {
    action: "add" | "delete" | "clear" | "update";
    item?: GalleryItem;
}

function emitGalleryChanged(detail: GalleryChangedDetail) {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GALLERY_CHANGED_EVENT, { detail }));
    }
}

/** Save an image to the gallery with metadata. */
export async function saveGalleryItem(item: GalleryItem): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readwrite");
        tx.objectStore(GALLERY_STORE).put(item);
        tx.oncomplete = () => { db.close(); emitGalleryChanged({ action: "add", item }); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Load all gallery items sorted by createdAt descending (newest first). */
export async function loadGalleryItems(): Promise<GalleryItem[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readonly");
        const store = tx.objectStore(GALLERY_STORE);
        const index = store.index("createdAt");
        const req = index.openCursor(null, "prev"); // descending
        const items: GalleryItem[] = [];

        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                items.push(cursor.value as GalleryItem);
                cursor.continue();
            } else {
                db.close();
                resolve(items);
            }
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

/** Delete a single gallery item by ID. */
export async function deleteGalleryItem(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readwrite");
        tx.objectStore(GALLERY_STORE).delete(id);
        tx.oncomplete = () => { db.close(); emitGalleryChanged({ action: "delete" }); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Delete ALL gallery items. */
export async function clearGallery(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readwrite");
        tx.objectStore(GALLERY_STORE).clear();
        tx.oncomplete = () => { db.close(); emitGalleryChanged({ action: "clear" }); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Partially update a gallery item (e.g. folder, starred, prompt). */
export async function updateGalleryItem(
    id: string,
    updates: Partial<Pick<GalleryItem, "folder" | "starred" | "prompt">>,
): Promise<GalleryItem | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readwrite");
        const store = tx.objectStore(GALLERY_STORE);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const item = getReq.result as GalleryItem | undefined;
            if (!item) { db.close(); resolve(null); return; }
            const updated = { ...item, ...updates };
            store.put(updated);
            tx.oncomplete = () => { db.close(); emitGalleryChanged({ action: "update", item: updated }); resolve(updated); };
        };
        getReq.onerror = () => { db.close(); reject(getReq.error); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Batch-update specific gallery items by their IDs (e.g. multi-select move to folder). */
export async function updateGalleryItemsByIds(
    ids: string[],
    updates: Partial<Pick<GalleryItem, "folder" | "starred" | "prompt">>,
): Promise<number> {
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readwrite");
        const store = tx.objectStore(GALLERY_STORE);
        const req = store.openCursor();
        let count = 0;

        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                const item = cursor.value as GalleryItem;
                if (idSet.has(item.id)) {
                    cursor.update({ ...item, ...updates });
                    count++;
                }
                cursor.continue();
            }
        };
        tx.oncomplete = () => { db.close(); emitGalleryChanged({ action: "update" }); resolve(count); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/** Batch-update all gallery items matching a folder name (e.g. for rename). */
export async function updateGalleryItemsBatch(
    oldFolder: string,
    newFolder: string | undefined,
): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GALLERY_STORE, "readwrite");
        const store = tx.objectStore(GALLERY_STORE);
        const req = store.openCursor();
        let count = 0;

        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                const item = cursor.value as GalleryItem;
                if (item.folder === oldFolder) {
                    item.folder = newFolder;
                    cursor.update(item);
                    count++;
                }
                cursor.continue();
            }
        };
        tx.oncomplete = () => { db.close(); emitGalleryChanged({ action: "update" }); resolve(count); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

// ═══════════════════════════════════════
//  Storage management utilities
// ═══════════════════════════════════════

export interface StoreSizeInfo {
    /** Human-readable label */
    label: string;
    /** Number of records */
    count: number;
    /** Approximate size in bytes */
    bytes: number;
}

/** Estimate the byte-size and record count for a single object store. */
async function estimateStoreSize(storeName: string): Promise<StoreSizeInfo> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.openCursor();
        let count = 0;
        let bytes = 0;

        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                count++;
                const val = cursor.value;
                if (typeof val === "string") {
                    bytes += val.length * 2; // UTF-16
                } else if (Array.isArray(val)) {
                    bytes += val.reduce((total, item) => total + (typeof item === "string" ? item.length * 2 : 0), 0);
                } else if (val && typeof val === "object") {
                    // Gallery items: mainly the dataUrl field
                    const item = val as GalleryItem;
                    bytes += (item.dataUrl?.length ?? 0) * 2;
                    bytes += (item.prompt?.length ?? 0) * 2;
                    bytes += 200; // metadata overhead estimate
                }
                cursor.continue();
            } else {
                db.close();
                resolve({ label: storeName, count, bytes });
            }
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

/** Get size info for all stores in the database. */
export async function getStorageSizeInfo(): Promise<StoreSizeInfo[]> {
    try {
        const [images, gallery] = await Promise.all([
            estimateStoreSize(STORE_NAME),
            estimateStoreSize(GALLERY_STORE),
        ]);
        images.label = "Chat Images";
        gallery.label = "Gallery";
        return [images, gallery];
    } catch {
        return [];
    }
}

/** Delete the entire IndexedDB database (nuclear option). */
export async function deleteEntireDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
            // DB might still be open somewhere — try again after a tick
            console.warn("IndexedDB delete blocked, retrying...");
            setTimeout(() => resolve(), 200);
        };
    });
}

/**
 * Remove orphaned images from the "images" store whose IDs
 * don't match any message in the provided sessions.
 */
export async function cleanOrphanedImages(validMessageIds: Set<string>): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        const orphanIds: string[] = [];

        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                if (!validMessageIds.has(cursor.key as string)) {
                    orphanIds.push(cursor.key as string);
                    cursor.delete();
                }
                cursor.continue();
            }
            // cursor exhausted — transaction will complete
        };

        tx.oncomplete = () => { db.close(); resolve(orphanIds.length); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
