import React, { useState, useEffect } from 'react';
import {
  FileText,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Lock,
  Layers,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { WorkspaceDocument } from '../../../types/workspace.ts';

interface OnlyOfficeEmbeddedEditorProps {
  document: WorkspaceDocument;
  onFallbackToNative: () => void;
  onSave?: () => void;
  isReadOnly?: boolean;
}

export const OnlyOfficeEmbeddedEditor: React.FC<OnlyOfficeEmbeddedEditorProps> = ({
  document,
  onFallbackToNative,
  onSave,
  isReadOnly = false,
}) => {
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [editorUrl, setEditorUrl] = useState<string>('');

  const onlyofficeHost =
    (typeof window !== 'undefined' && (window as any).VITE_ONLYOFFICE_HOST) || 'http://localhost:8080';

  useEffect(() => {
    let isMounted = true;
    const checkServer = async () => {
      try {
        setServerStatus('checking');
        // Simple ping to OnlyOffice healthcheck or endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`${onlyofficeHost}/healthcheck`, {
          method: 'GET',
          signal: controller.signal,
          mode: 'no-cors', // handle cross-origin gracefully
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (isMounted) {
          // If fetch completed (or even opaque no-cors response), consider server alive
          if (res) {
            setServerStatus('connected');
            setEditorUrl(`/api/workspace-documents/${document.id}/editor-session`);
          } else {
            setServerStatus('offline');
          }
        }
      } catch (err) {
        if (isMounted) {
          setServerStatus('offline');
        }
      }
    };

    checkServer();
    return () => {
      isMounted = false;
    };
  }, [document.id, onlyofficeHost]);

  const isApproved = document.status === 'APPROVED';

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Header Bar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onFallbackToNative}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            title="Kembali ke Editor Kanvas Blok"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Ke Native Studio
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-md">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-sm">{document.title}</span>
                <span className="text-xs font-mono text-slate-400">({document.document_code})</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>Mode: OnlyOffice DOCX Engine</span>
                <span>•</span>
                <span>Format: {document.layout_preset}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isApproved ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
              <Lock className="w-3.5 h-3.5" />
              Dokumen Terkunci (APPROVED)
            </div>
          ) : (
            <>
              {onSave && (
                <button
                  onClick={onSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Sesi
                </button>
              )}
            </>
          )}

          <button
            onClick={onFallbackToNative}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-950/50 hover:bg-amber-900/50 border border-amber-800/60 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            Beralih ke Kanvas Blok
          </button>
        </div>
      </div>

      {/* Editor Body or Fallback Area */}
      <div className="flex-1 relative bg-slate-950 flex flex-col items-center justify-center">
        {serverStatus === 'checking' && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm font-medium">Memeriksa koneksi OnlyOffice Document Server...</p>
            <p className="text-xs text-slate-500">Mempersiapkan dokumen {document.document_code}.docx</p>
          </div>
        )}

        {serverStatus === 'offline' && (
          <div className="max-w-lg p-6 bg-slate-900 border border-amber-500/40 rounded-xl shadow-xl text-center space-y-4 m-4">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                OnlyOffice Document Server Belum Terdeteksi
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Container OnlyOffice belum berjalan di port <code className="text-amber-300">8080</code>{' '}
                (atau memerlukan docker compose). Sistem menyediakan fallback otomatis tanpa hambatan
                menggunakan <strong className="text-slate-200">Native Block Canvas Studio</strong>.
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-left text-xs font-mono text-slate-400">
              <p className="text-[11px] text-slate-500 mb-1 font-sans font-bold">
                Langkah menjalankan OnlyOffice (opsional):
              </p>
              <code>docker compose -f docker-compose.onlyoffice.yml up -d</code>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={onFallbackToNative}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
              >
                <Layers className="w-4 h-4" />
                Gunakan Native Block Studio Sekarang
              </button>
              <button
                onClick={() => setServerStatus('checking')}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Lagi
              </button>
            </div>
          </div>
        )}

        {serverStatus === 'connected' && (
          <iframe
            src={editorUrl}
            title={`OnlyOffice Editor - ${document.title}`}
            className="w-full h-full border-0"
            allow="fullscreen; clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  );
};
