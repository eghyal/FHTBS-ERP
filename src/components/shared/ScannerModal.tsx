import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, CameraDevice } from "html5-qrcode";
import {
  Camera,
  X,
  AlertCircle,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Info,
  Upload,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface ScannerModalProps {
  isOpen: boolean;
  onScan: (text: string) => void;
  onClose: () => void;
}

type ScannerStatus =
  "IDLE" | "PERMISSION" | "INITIALIZING" | "SCANNING" | "ERROR";

export const ScannerModal = ({
  isOpen,
  onScan,
  onClose,
}: ScannerModalProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isInitializing = useRef(false);
  const [status, setStatus] = useState<ScannerStatus>("IDLE");
  const [hasError, setHasError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [isManual, setIsManual] = useState(() => {
    // Check if running in a restricted sandbox/iframe or lacking media devices capabilities
    const isInsideIframe =
      typeof window !== "undefined" && window.self !== window.top;
    const hasMediaCapabilities =
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia;
    return isInsideIframe || !hasMediaCapabilities;
  });
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (isOpen && !isManual) {
      const isAuthorized = localStorage.getItem("camera_authorized");
      if (isAuthorized) {
        initScanner();
      } else {
        setStatus("PERMISSION");
      }
    } else {
      stopAndClearScanner();
    }
    return () => {
      stopAndClearScanner();
    };
  }, [isOpen, isManual]);

  const handleAuthorize = () => {
    localStorage.setItem("camera_authorized", "true");
    initScanner();
  };

  const checkPermission = async () => {
    setStatus("IDLE");
    setHasError(null);
    initScanner();
  };

  const initScanner = async () => {
    if (isInitializing.current) return;
    isInitializing.current = true;
    setStatus("INITIALIZING");
    try {
      const devices = await fetchCameras();
      if (devices.length > 0) {
        await startScanner(devices[0].id);
      }
    } catch (err) {
      handleCameraError(err, "Failed to initialize");
    } finally {
      isInitializing.current = false;
    }
  };

  const fetchCameras = async (): Promise<CameraDevice[]> => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment"),
        );
        setCameras(devices);
        const targetId = backCamera ? backCamera.id : devices[0].id;
        setSelectedCameraId(targetId);
        return devices;
      } else {
        throw new Error("No camera detected on your device.");
      }
    } catch (err: any) {
      throw err;
    }
  };

  const handleCameraError = (err: any, context: string) => {
    console.error(context, err);
    const errMsg = (
      typeof err === "string" ? err : err?.message || err?.name || ""
    ).toLowerCase();

    if (
      errMsg.includes("notallowed") ||
      errMsg.includes("denied") ||
      errMsg.includes("permission")
    ) {
      setStatus("ERROR");
      setHasError(
        "Camera access is blocked by the browser settings. Please allow camera access in your settings or try Manual Entry.",
      );
    } else if (
      errMsg.includes("notreadable") ||
      errMsg.includes("not readable") ||
      errMsg.includes("could not start video source")
    ) {
      setStatus("ERROR");
      setHasError(
        "The camera stream could not be started or is busy in another app. Please switch to Manual Entry.",
      );
    } else if (errMsg.includes("not found") || errMsg.includes("no camera")) {
      setStatus("ERROR");
      setHasError(
        "No video cameras were detected on your device. Please use Manual Entry mode.",
      );
    } else {
      setStatus("ERROR");
      setHasError(
        "Failed to initialize video stream: " +
          (err?.message ||
            "Internal hardware driver error. Please type the trace code manually."),
      );
    }
  };

  const stopAndClearScanner = async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch (err) {
        console.warn("Sensor shutdown notice", err);
      } finally {
        scannerRef.current = null;
      }
    }
    // Deep kill: ensure all media tracks are actually stopped
    try {
      const streams = await navigator.mediaDevices.enumerateDevices();
      if (streams) {
        // This is a generic approach, html5-qrcode should handle it but let's be sure
        const tracks = (window as any).currentStream?.getTracks();
        tracks?.forEach((track: any) => track.stop());
      }
    } catch (e) {}
  };

  const startScanner = async (cameraId: string | null) => {
    setStatus("INITIALIZING");
    setHasError(null);
    await stopAndClearScanner();

    // Give hardware time to synchronize
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      if (!document.getElementById("reader")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      const config = {
        fps: 30,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.8);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        disableFlip: false,
        videoConstraints: {
          focusMode: "continuous",
          advanced: [{ focusMode: "continuous" } as any],
          width: { min: 640, ideal: 1920 },
          height: { min: 480, ideal: 1080 },
          facingMode: cameraId ? undefined : "environment",
        },
      };

      const cameraConfig = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: "environment" };

      await scanner.start(
        cameraConfig,
        config as any,
        (decodedText) => {
          onScan(decodedText);
          handleStop();
        },
        (_err) => {
          /* Scan background cycle */
        },
      );
      setStatus("SCANNING");
    } catch (err: any) {
      handleCameraError(err, "Stream Link Failure");
    }
  };

  const handleStop = async () => {
    await stopAndClearScanner();
    onClose();
  };

  const switchCamera = async () => {
    if (cameras.length > 1 && selectedCameraId) {
      const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextCameraId = cameras[nextIndex].id;
      setSelectedCameraId(nextCameraId);
      await startScanner(nextCameraId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use html5-qrcode's static scanFile function if available,
    // or use the instance if it exists but is not scanning
    const html5QrCode = new Html5Qrcode("reader");
    try {
      showToast("Processing image...", "info");
      const result = await html5QrCode.scanFileV2(file, true);
      onScan(result.decodedText);
      onClose();
    } catch (err) {
      console.error(err);
      showToast("No valid QR code found in the image.", "error");
    } finally {
      html5QrCode.clear();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-0 md:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full h-full md:h-[620px] md:max-w-[400px] bg-white md:rounded-xl overflow-hidden shadow-2xl flex flex-col border border-stone-200"
      >
        {/* Modern Switcher Tabs */}
        <div className="flex border-b border-stone-200 bg-stone-50 px-6 pt-4 pb-0 shrink-0 select-none z-20">
          <button
            type="button"
            onClick={() => {
              setIsManual(false);
              setHasError(null);
            }}
            className={cn(
              "flex-1 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] transition-all relative cursor-pointer",
              !isManual ? "text-stone-900" : "text-stone-500 hover:text-stone-800",
            )}
          >
            Camera Lens
            {!isManual && (
              <motion.div
                layoutId="scannerTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-stone-900"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsManual(true);
              stopAndClearScanner();
              setHasError(null);
            }}
            className={cn(
              "flex-1 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] transition-all relative cursor-pointer",
              isManual ? "text-stone-900" : "text-stone-500 hover:text-stone-800",
            )}
          >
            Manual Entry
            {isManual && (
              <motion.div
                layoutId="scannerTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-stone-900"
              />
            )}
          </button>
        </div>

        <div className="flex-1 relative bg-stone-50 flex flex-col overflow-hidden items-center justify-center">
          <AnimatePresence mode="wait">
            {isManual ? (
              <motion.div
                key="manual-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute inset-0 z-10 bg-white flex flex-col justify-center p-8 text-center"
              >
                <div className="w-14 h-14 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-center mx-auto mb-5">
                  <Smartphone className="w-6 h-6 text-stone-800" />
                </div>
                <h3 className="text-base font-bold text-stone-900 mb-1 uppercase tracking-tight">
                  Direct Trace Entry
                </h3>
                <p className="text-[10px] text-stone-500 mb-6 leading-relaxed font-semibold uppercase tracking-wider max-w-[280px] mx-auto">
                  Enter a Purchase ID, SKU code, or serial token directly to bypass optical camera hardware.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (manualCode.trim()) {
                      onScan(manualCode.trim());
                      handleStop();
                    }
                  }}
                  className="space-y-3 w-full max-w-[280px] mx-auto"
                >
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="e.g. PR-0001, ITEM-001"
                    className="no-base-style w-full bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 rounded-lg px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider text-center focus:bg-white focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 outline-none transition-all"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="w-full py-3 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-xs active:scale-[0.98] cursor-pointer"
                  >
                    Submit Code
                  </button>
                </form>
              </motion.div>
            ) : (
              <>
                {status === "PERMISSION" && (
                  <motion.div
                    key="permission"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center p-10 text-center"
                  >
                    <div className="w-16 h-16 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-center mb-6">
                      <ShieldCheck className="w-7 h-7 text-stone-800" />
                    </div>
                    <h3 className="text-lg font-bold text-stone-900 mb-1.5 uppercase tracking-tight">
                      Camera Access Required
                    </h3>
                    <p className="text-[10px] text-stone-500 mb-6 leading-relaxed font-semibold uppercase tracking-wider">
                      Authorize optical camera access to scan QR and barcode labels.
                    </p>
                    <button
                      onClick={handleAuthorize}
                      className="w-full py-3 bg-stone-900 text-white font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-stone-800 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                    >
                      Authorize Camera
                    </button>
                  </motion.div>
                )}

                {status === "ERROR" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="w-16 h-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center mb-5">
                      <AlertCircle className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-bold text-stone-900 mb-1.5 uppercase tracking-tight">
                      Camera Unavailable
                    </h3>
                    <p className="text-[11px] text-stone-500 mb-6 leading-relaxed font-medium">
                      {hasError}
                    </p>
                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          setIsManual(true);
                          stopAndClearScanner();
                          setStatus("IDLE");
                        }}
                        className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all active:scale-[0.98] shadow-xs cursor-pointer"
                      >
                        Use Manual Entry
                      </button>
                      <button
                        type="button"
                        onClick={checkPermission}
                        className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                      >
                        Retry Camera
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2.5 bg-white border border-stone-200 text-stone-600 hover:text-stone-900 font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>

          {!isManual && (
            <>
              <div
                id="reader"
                className="w-full h-full"
                style={{ width: "100%", height: "100%" }}
              ></div>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                #reader video {
                  object-fit: cover !important;
                  width: 100% !important;
                  height: 100% !important;
                  border-radius: 0 !important;
                }
                #reader #reader__scan_region {
                  background: #fafaf9 !important;
                  height: 100% !important;
                }
                #reader #reader__dashboard_section_csr {
                  display: none !important; 
                }
              `,
                }}
              />

              {status === "SCANNING" && (
                <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center bg-stone-900/15">
                  <div className="relative w-[260px] h-[260px] border-2 border-white/60 rounded-xl overflow-hidden shadow-[0_0_0_9999px_rgba(28,25,23,0.35)]">
                    <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-stone-900 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-stone-900 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-stone-900 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-stone-900 rounded-br-xl"></div>

                    <motion.div
                      initial={{ top: "0%" }}
                      animate={{ top: "100%" }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="absolute left-0 right-0 h-[2px] bg-stone-900 shadow-[0_0_12px_rgba(28,25,23,0.8)]"
                    />
                  </div>
                  <div className="absolute top-6 text-center text-[10px] font-bold tracking-[0.2em] uppercase text-white bg-stone-900/50 px-3 py-1 rounded-full">
                    Align QR or Barcode in Frame
                  </div>
                </div>
              )}

              {status === "SCANNING" && cameras.length > 1 && (
                <div className="absolute bottom-6 right-6 z-20">
                  <button
                    onClick={switchCamera}
                    className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg flex items-center justify-center text-stone-800 border border-stone-200 hover:bg-white transition-all active:scale-95 shadow-md cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              )}

              {status === "INITIALIZING" && (
                <div className="absolute inset-0 z-30 bg-white flex flex-col items-center justify-center text-stone-700 gap-2">
                  <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin"></div>
                  <span className="text-[11px] font-semibold text-stone-500">Initializing camera...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Minimal Control Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col items-center gap-2">
          {!isManual && (
            <>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-[280px] py-2.5 bg-white text-stone-700 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-stone-100 transition-all flex items-center justify-center gap-2 active:scale-[0.98] border border-stone-200 shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-stone-700" />
                Upload QR Image
              </button>
            </>
          )}
          <button
            onClick={handleStop}
            className="w-full max-w-[280px] py-2.5 bg-stone-100 text-stone-600 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-stone-200 hover:text-stone-900 transition-all flex items-center justify-center gap-2 active:scale-[0.98] border border-stone-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Close Scanner
          </button>
        </div>
      </motion.div>
    </div>
  );
};
