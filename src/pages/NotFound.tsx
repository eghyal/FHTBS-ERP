import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-white p-8 sm:p-10 rounded-3xl border border-stone-200 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <FileQuestion className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-black tracking-widest text-[#b02524] uppercase">
            Error 404
          </span>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-xs text-stone-500 leading-relaxed font-medium">
            Alamat URL yang Anda tuju tidak tersedia atau telah dipindahkan ke tautan lain.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full sm:w-auto rounded-xl flex items-center justify-center gap-2 border-stone-200"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </Button>

          <Link to="/erp" className="w-full sm:w-auto">
            <Button
              variant="primary"
              className="w-full rounded-xl flex items-center justify-center gap-2 bg-[#b02524] hover:bg-red-800 text-white"
            >
              <Home className="w-4 h-4" />
              <span>Ke Dashboard</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
