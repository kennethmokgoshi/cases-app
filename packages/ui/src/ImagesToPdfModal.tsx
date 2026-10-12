'use client';

import { useEffect, useRef, useState } from 'react';

type Layout = 'ID_SHEET' | 'PAGES';

type Item = {
    key: string;
    file: File;
    previewUrl: string;
    /** Clockwise quarter-turns applied on top of the photo's own orientation. */
    rotation: 0 | 90 | 180 | 270;
};

const PRESETS: { id: string; label: string; type: string; layout: Layout; hint: string }[] = [
    { id: 'id', label: 'ID — front and back', type: 'ID', layout: 'ID_SHEET', hint: 'Add 2 images: front first, then back. They share one page.' },
    { id: 'poa', label: 'Power of Attorney', type: 'POA', layout: 'PAGES', hint: 'Add each page in order (page 1, 2, 3 …). One page per image.' },
    { id: 'zpoa', label: 'Zenowethu POA', type: 'ZENOWETHU_POA', layout: 'PAGES', hint: 'Add each page in order. One page per image.' },
    { id: 'payslip', label: 'Payslip', type: 'PAYSLIP', layout: 'PAGES', hint: 'One page per image.' },
    { id: 'bank', label: 'Bank statement', type: 'BANK_STATEMENT', layout: 'PAGES', hint: 'One page per image.' },
    { id: 'por', label: 'Proof of residence', type: 'PROOF_OF_RESIDENCE', layout: 'PAGES', hint: 'One page per image.' },
    { id: 'other', label: 'Other document', type: 'OTHER', layout: 'PAGES', hint: 'One page per image.' },
];

const MAX_IMAGES = 12;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 2400; // px — keeps a readable A4 scan without huge PDFs

/**
 * Re-draws an image upright (honouring EXIF), rotated as requested, as a JPEG.
 * This is what goes on the PDF page; the untouched original is uploaded as well.
 */
export async function normaliseImage(file: File, rotation: Item['rotation']): Promise<Blob> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const quarter = rotation === 90 || rotation === 270;
    const srcW = quarter ? bitmap.height : bitmap.width;
    const srcH = quarter ? bitmap.width : bitmap.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(srcW * scale);
    canvas.height = Math.round(srcH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process this image.');
    ctx.fillStyle = '#ffffff'; // PNGs with transparency would otherwise go black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap.close();
    return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process an image.'))), 'image/jpeg', 0.88),
    );
}

export function ImagesToPdfModal({ caseId, onClose, onCreated }: {
    caseId: string;
    onClose: () => void;
    /** Called after the PDF and originals were saved, so the list can refresh. */
    onCreated: (message: string) => void;
}) {
    const [presetId, setPresetId] = useState('id');
    const [items, setItems] = useState<Item[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const itemsRef = useRef<Item[]>([]);
    itemsRef.current = items;

    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    const maxForPreset = preset.layout === 'ID_SHEET' ? 2 : MAX_IMAGES;

    // Release object URLs when the modal closes.
    useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

    const addFiles = (list: FileList | null) => {
        if (!list) return;
        setError('');
        const next: Item[] = [];
        for (const file of Array.from(list)) {
            if (!file.type.startsWith('image/')) {
                setError(`"${file.name}" is not an image. Use JPG, PNG or WebP photos or scans.`);
                continue;
            }
            if (file.size > MAX_BYTES) {
                setError(`"${file.name}" is larger than 15 MB.`);
                continue;
            }
            next.push({ key: `${file.name}-${file.size}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file), rotation: 0 });
        }
        setItems((prev) => {
            const merged = [...prev, ...next];
            if (merged.length > maxForPreset) {
                setError(`This document type takes at most ${maxForPreset} images.`);
                merged.slice(maxForPreset).forEach((i) => URL.revokeObjectURL(i.previewUrl));
                return merged.slice(0, maxForPreset);
            }
            return merged;
        });
        if (fileInput.current) fileInput.current.value = '';
    };

    const move = (index: number, delta: -1 | 1) =>
        setItems((prev) => {
            const to = index + delta;
            if (to < 0 || to >= prev.length) return prev;
            const copy = [...prev];
            [copy[index], copy[to]] = [copy[to], copy[index]];
            return copy;
        });

    const rotate = (index: number) =>
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, rotation: ((it.rotation + 90) % 360) as Item['rotation'] } : it)));

    const remove = (index: number) =>
        setItems((prev) => {
            URL.revokeObjectURL(prev[index].previewUrl);
            return prev.filter((_, i) => i !== index);
        });

    const changePreset = (id: string) => {
        setPresetId(id);
        setError('');
        const limit = PRESETS.find((p) => p.id === id)?.layout === 'ID_SHEET' ? 2 : MAX_IMAGES;
        setItems((prev) => {
            prev.slice(limit).forEach((i) => URL.revokeObjectURL(i.previewUrl));
            return prev.slice(0, limit);
        });
    };

    const create = async () => {
        if (items.length === 0) { setError('Add at least one image.'); return; }
        setBusy(true);
        setError('');
        try {
            const form = new FormData();
            form.append('type', preset.type);
            form.append('layout', preset.layout);
            for (const it of items) {
                const page = await normaliseImage(it.file, it.rotation);
                form.append('pages', new File([page], `${it.file.name}.jpg`, { type: 'image/jpeg' }));
                form.append('originals', it.file);
            }
            const res = await fetch(`/api/cases/${caseId}/documents/images-to-pdf`, { method: 'POST', body: form });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
            onCreated(`PDF created from ${items.length} image${items.length === 1 ? '' : 's'}. The original images were kept too.`);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the PDF.');
        } finally {
            setBusy(false);
        }
    };

    const sideLabel = (i: number) => (preset.layout === 'ID_SHEET' ? (i === 0 ? 'Front' : 'Back') : `Page ${i + 1}`);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Create PDF from images">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-zeno-navy p-6 shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white">🖼️ Images → PDF</h3>
                        <p className="text-xs text-gray-400">Turn photos or scans into one PDF. The original images are saved too.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} className="text-gray-400 hover:text-white" aria-label="Close">✕</button>
                </div>

                <label className="mb-1 block text-xs font-medium text-gray-400" htmlFor="img2pdf-type">What are you uploading?</label>
                <select
                    id="img2pdf-type"
                    value={presetId}
                    onChange={(e) => changePreset(e.target.value)}
                    disabled={busy}
                    className="mb-1 w-full rounded-lg border border-white/20 bg-zeno-gray px-3 py-2 text-sm text-white [color-scheme:dark] [&>option]:bg-zeno-navy"
                >
                    {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <p className="mb-4 text-xs text-gray-500">{preset.hint}</p>

                <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/20 p-5 text-center text-sm text-gray-300 hover:border-zeno-cyan/50">
                    <span>📤 Choose images (or drop them here)</span>
                    <span className="text-xs text-gray-500">JPG, PNG or WebP · up to {maxForPreset} · max 15 MB each</span>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={busy}
                        onChange={(e) => addFiles(e.target.files)}
                        className="sr-only"
                    />
                </label>

                {items.length === 0 ? (
                    <p className="mb-4 text-center text-sm text-gray-500">No images added yet.</p>
                ) : (
                    <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {items.map((it, i) => (
                            <li key={it.key} className="rounded-lg border border-white/10 bg-white/5 p-2">
                                <div className="mb-1 flex items-center justify-between text-xs font-medium text-zeno-cyan">
                                    <span>{sideLabel(i)}</span>
                                </div>
                                <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-black/30">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={it.previewUrl}
                                        alt={sideLabel(i)}
                                        className="max-h-32 max-w-full object-contain transition-transform"
                                        style={{ transform: `rotate(${it.rotation}deg)`, imageOrientation: 'from-image' }}
                                    />
                                </div>
                                <p className="mt-1 truncate text-[10px] text-gray-500">{it.file.name}</p>
                                <div className="mt-1 flex gap-1">
                                    <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="flex-1 rounded bg-white/10 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-30" aria-label="Move earlier">←</button>
                                    <button type="button" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className="flex-1 rounded bg-white/10 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-30" aria-label="Move later">→</button>
                                    <button type="button" disabled={busy} onClick={() => rotate(i)} className="flex-1 rounded bg-white/10 py-1 text-xs text-white hover:bg-white/20" aria-label="Rotate">⟳</button>
                                    <button type="button" disabled={busy} onClick={() => remove(i)} className="flex-1 rounded bg-red-500/20 py-1 text-xs text-red-300 hover:bg-red-500/30" aria-label="Remove">✕</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-400">{error}</div>}

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Cancel</button>
                    <button
                        type="button"
                        onClick={create}
                        disabled={busy || items.length === 0}
                        className="rounded-lg bg-zeno-cyan/30 px-4 py-2 text-sm font-medium text-zeno-cyan hover:bg-zeno-cyan/40 disabled:opacity-40"
                    >
                        {busy ? '⏳ Creating PDF…' : `Create PDF${items.length ? ` (${items.length} image${items.length === 1 ? '' : 's'})` : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
