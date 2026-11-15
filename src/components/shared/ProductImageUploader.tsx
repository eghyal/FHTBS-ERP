import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  UploadCloud,
  AlertCircle,
  Loader2,
  X,
  Plus,
  Star,
  Lock,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { uploadUniversalFile } from "@/lib/cloudStorage";
import { optimizeProductImage } from "@/lib/imageOptimizer";

export interface ProductImageUploaderProps {
  id?: string;
  label?: string;
  value?: string;
  galleryUrls?: string[];
  onChange?: (primaryUrl: string) => void;
  onGalleryChange?: (galleryUrls: string[]) => void;
  onImagesChange?: (primaryUrl: string, galleryUrls: string[]) => void;
  pathPrefix?: string;
  className?: string;
  disabled?: boolean;
}

export function ProductImageUploader({
  id = "product-image-uploader",
  label = "Product Gallery & Portfolio Photos (Multi-Upload Supported >= 1)",
  value = "",
  galleryUrls = [],
  onChange,
  onGalleryChange,
  onImagesChange,
  pathPrefix = "catalog_products",
  className = "",
  disabled = false,
}: ProductImageUploaderProps) {
  // Consolidate ordered unique images with active Cover locked at index 0
  const currentImages = React.useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    if (value && typeof value === "string" && value.trim()) {
      const clean = value.trim();
      seen.add(clean);
      list.push(clean);
    }
    if (Array.isArray(galleryUrls)) {
      galleryUrls.forEach((u) => {
        if (u && typeof u === "string") {
          const clean = u.trim();
          if (clean && !seen.has(clean)) {
            seen.add(clean);
            list.push(clean);
          }
        }
      });
    }
    return list;
  }, [value, galleryUrls]);

  // Ref prevents stale closures during multi-file sequential uploads
  const latestImagesRef = useRef<string[]>(currentImages);
  latestImagesRef.current = currentImages;

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Optimizing Image...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBrokenUrls({});
  }, [id, currentImages.length]);

  const notifyChanges = useCallback(
    (newImages: string[]) => {
      // Keep ref immediately synchronous across back-to-back multi-file appends
      latestImagesRef.current = newImages;
      const primary = newImages[0] || "";
      if (onChange) onChange(primary);
      if (onGalleryChange) onGalleryChange(newImages);
      if (onImagesChange) onImagesChange(primary, newImages);
    },
    [onChange, onGalleryChange, onImagesChange],
  );

  // Appends uploaded photo at the end so locked Main Cover (index 0) is NEVER overwritten automatically
  const appendUploadedImage = useCallback(
    (newUrl: string) => {
      if (!newUrl || !newUrl.trim()) return;
      const cleanUrl = newUrl.trim();
      const base = latestImagesRef.current;
      if (base.includes(cleanUrl)) return;
      const updated = [...base, cleanUrl];
      notifyChanges(updated);
    },
    [notifyChanges],
  );

  const handleRemoveImage = (indexToRemove: number) => {
    const base = latestImagesRef.current;
    const updated = base.filter((_, idx) => idx !== indexToRemove);
    notifyChanges(updated);
  };

  // Explicit admin action to unlock and set a different Main Cover
  const handleSetPrimary = (indexToPrimary: number) => {
    const base = latestImagesRef.current;
    if (indexToPrimary <= 0 || indexToPrimary >= base.length) return;
    const selected = base[indexToPrimary];
    const rest = base.filter((_, idx) => idx !== indexToPrimary);
    const updated = [selected, ...rest];
    notifyChanges(updated);
  };

  // Reorder secondary portfolio photos without touching locked Main Cover (index 0)
  const handleMoveSecondary = (fromIdx: number, direction: -1 | 1) => {
    const base = latestImagesRef.current;
    const toIdx = fromIdx + direction;
    if (fromIdx < 1 || toIdx < 1 || toIdx >= base.length) return;
    const updated = [...base];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    notifyChanges(updated);
  };

  const processAndUploadFile = async (file: File, indexLabel?: string) => {
    setErrorMessage(null);

    if (!file.type.startsWith("image/")) {
      setErrorMessage("File must be an image (JPG, PNG, WEBP, AVIF).");
      return;
    }

    try {
      setIsProcessing(true);
      setStatusText(
        indexLabel ? `Compressing ${indexLabel}...` : "Compressing WebP Image...",
      );

      const optResult = await optimizeProductImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        format: "image/webp",
      });

      setIsProcessing(false);
      setUploading(true);
      setStatusText(
        indexLabel ? `Saving ${indexLabel} to Cloud SSOT...` : "Saving Photo to Database & Cloud...",
      );
      setProgress(40);

      const uploadedUrl = await uploadUniversalFile(
        optResult.file,
        pathPrefix,
      );

      setProgress(100);
      appendUploadedImage(uploadedUrl);
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMessage(err?.message || "Failed to upload photo.");
    } finally {
      setIsProcessing(false);
      setUploading(false);
      setProgress(0);
    }
  };

  const handleMultipleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const labelText = total > 1 ? `photo ${i + 1}/${total}` : undefined;
      await processAndUploadFile(files[i], labelText);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div id={id} className={`space-y-3 font-sans ${className}`}>
      {/* Label Bar */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
          {label}
        </label>
        {currentImages.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
            <Lock className="w-2.5 h-2.5 shrink-0" />
            <span>Cover Locked</span>
          </span>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg,image/avif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          handleMultipleFiles(files);
          e.target.value = "";
        }}
        disabled={disabled || isProcessing || uploading}
      />

      {/* Upload Progress Loader */}
      {(isProcessing || uploading) && (
        <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-stone-900 block truncate">
              {statusText}
            </span>
            <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-amber-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Multi-Photo Gallery Grid */}
      {currentImages.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-stone-500 font-medium gap-2 flex-wrap">
            <span>
              <strong className="text-stone-900 font-mono tabular-nums">{currentImages.length}</strong>{" "}
              Photo{currentImages.length > 1 ? "s" : ""} • Main Cover is locked until changed manually
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isProcessing || uploading}
              className="text-stone-900 hover:text-amber-800 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Portfolio Photos</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {currentImages.map((imgUrl, idx) => {
              const isCover = idx === 0;
              const isBroken = Boolean(brokenUrls[imgUrl]);

              return (
                <div
                  key={`${imgUrl}-${idx}`}
                  className={`relative rounded-xl border overflow-hidden bg-white group shadow-2xs ${
                    isCover
                      ? "border-amber-500 ring-2 ring-amber-500/20"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <div className="w-full aspect-4/3 bg-stone-100 overflow-hidden relative flex items-center justify-center">
                    {!isBroken ? (
                      <img
                        src={imgUrl}
                        alt={isCover ? "Main Product Cover" : `Portfolio photo ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenUrls((prev) => ({ ...prev, [imgUrl]: true }))
                        }
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-stone-100 text-stone-400 p-2 text-center">
                        <ImageIcon className="w-5 h-5 mb-1 text-stone-400" />
                        <span className="text-[9px] font-semibold leading-tight">
                          Photo unavailable
                        </span>
                      </div>
                    )}

                    {/* Primary Cover Badge vs Explicit Set Cover Trigger */}
                    {isCover ? (
                      <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-600 text-white shadow-xs inline-flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-white" />
                        <span>Main Cover</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(idx)}
                        className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold bg-stone-900/85 hover:bg-amber-600 text-white opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer shadow-xs"
                        title="Set as Main Cover"
                      >
                        Set Cover
                      </button>
                    )}

                    {/* Remove Button */}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-stone-900/80 hover:bg-rose-600 text-white opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer"
                        title="Remove Photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    {/* Reorder Secondary Portfolio Photos (does not unlock or replace cover) */}
                    {!isCover && !disabled && currentImages.length > 2 && (
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {idx > 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveSecondary(idx, -1)}
                            className="p-1 rounded bg-stone-900/80 hover:bg-stone-900 text-white cursor-pointer"
                            title="Move earlier in portfolio"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                        )}
                        {idx < currentImages.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveSecondary(idx, 1)}
                            className="p-1 rounded bg-stone-900/80 hover:bg-stone-900 text-white cursor-pointer"
                            title="Move later in portfolio"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drag & Drop Upload Zone (compact when photos already attached, prominent when empty) */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() =>
          !disabled && !isProcessing && !uploading && fileInputRef.current?.click()
        }
        className={`relative border-2 border-dashed rounded-2xl flex items-center justify-center text-center cursor-pointer transition-all ${
          currentImages.length > 0 ? "p-3" : "p-5 sm:p-6 flex-col"
        } ${
          isDragging
            ? "border-amber-500 bg-amber-50/30"
            : "border-stone-200 hover:border-stone-300 bg-stone-50/60 hover:bg-stone-50"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {currentImages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-600">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-800">
                Click or drag &amp; drop photos here to upload (multi-file upload supported)
              </p>
              <p className="text-[11px] text-stone-400 mt-1">
                Stored permanently in Database &amp; Cloud SSOT · Supports JPG, PNG, WEBP
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-600">
            <UploadCloud className="w-4 h-4 text-stone-500 shrink-0" />
            <span>
              Drop or click to append additional portfolio photos (current Main Cover stays locked)
            </span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
