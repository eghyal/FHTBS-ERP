import React, { useState, useEffect } from "react";
import {
  Briefcase,
  MapPin,
  Clock,
  Banknote,
  Coins,
  ArrowLeft,
  CheckCircle2,
  Send,
  FileText,
  ChevronRight,
  Sparkles,
  Building,
  ArrowRight,
  AlertCircle,
  UploadCloud,
  X,
  Printer,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { generatePDF } from "@/lib/pdfGenerator";

import {
  PublicHeader,
  PublicFooter,
  usePublicCmsConfig,
} from "@/components/layouts/PublicLayout";
import {
  harmonizeScenePalette,
  isAnnualEventActive,
} from "@/constants/cmsDefaults";
import { trackPageView, trackJobView, trackJobApplyClick, trackFilter } from "@/lib/tracker";
import {
  getLatestCmsSnapshot,
  recordServerCmsSnapshot,
  subscribeToCmsUpdates,
} from "@/utils/cmsLiveSync";
import {
  normalizeDepartmentToRole,
  getDepartmentLabel,
} from "@/constants/rbac";

const formatSalaryString = (val?: string) => {
  if (!val) return "Kompetitif / Sesuai Kualifikasi";
  // Standardize the separator to "s/d" and remove the second "Rp"
  return val.replace(
    /(Rp\s*[\d.,-]+)\s*(?:-|s\/d)\s*Rp\s*([\d.,-]+)/gi,
    "$1 s/d $2",
  );
};

interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  requirements: string; // JSON array or string
  benefits: string; // JSON array or string
  salary_string?: string;
  status: string;
  pamphlet_bg_color?: string;
  pamphlet_accent_color?: string;
  created_at: string;
}

export default function Careers() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false); // Graceful Degradation
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");

  // CMS & Team
  const [cmsContent, setCmsContent] = useState<any>(
    () => getLatestCmsSnapshot("careers") || {},
  );
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Tracking Application & Self-Service Offering Confirmation State
  const [isTracking, setIsTracking] = useState(false);
  const [trackEmail, setTrackEmail] = useState("");
  const [trackId, setTrackId] = useState("");
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [isPrintingOffer, setIsPrintingOffer] = useState(false);
  const [isSubmittingOfferConfirm, setIsSubmittingOfferConfirm] = useState(false);
  const [offerConfirmForm, setOfferConfirmForm] = useState({
    join_date: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    id_card_number: "",
    npwp: "",
    ptkp_status: "TK/0",
    bank_account_info: "",
    candidate_notes: "",
  });
  const offeringLetterRef = React.useRef<HTMLDivElement>(null);

  // Application Form State
  const [isApplying, setIsApplying] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    linkedin: "",
    experience: "",
    coverLetter: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [applicationId, setApplicationId] = useState("");

  // Resume Upload State
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    const unsubscribeLive = subscribeToCmsUpdates<any>("careers", (data) => {
      if (data && typeof data === "object") {
        setCmsContent(data);
      }
    });
    fetchData();
    trackPageView("CAREERS", "Portal Lowongan & Karir Pabrik Paving Joss", "/careers");
    return () => {
      unsubscribeLive();
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setApiError(false);

      const [jobsRes, cmsRes, teamRes] = await Promise.all([
        apiFetch("/api/hr/jobs-public"),
        apiFetch("/api/cms/careers"),
        apiFetch("/api/public/team"),
      ]);

      if (jobsRes.ok) setJobs(jobsRes.data);
      if (cmsRes.ok && cmsRes.data) {
        recordServerCmsSnapshot("careers", cmsRes.data);
        setCmsContent(cmsRes.data);
      }
      if (teamRes.ok) setTeamMembers(teamRes.data);

      if (!jobsRes.ok) throw new Error("Jobs API failed");
    } catch (err) {
      console.error(err);
      setJobs([]);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSubmit = async (e?: React.FormEvent, customEmail?: string, customId?: string) => {
    if (e) e.preventDefault();
    const targetEmail = (customEmail ?? trackEmail).trim();
    const targetId = (customId ?? trackId).trim();
    if (!targetEmail || !targetId) return;
    setTrackingLoading(true);
    try {
      const res = await apiFetch("/api/hr/track", {
        method: "POST",
        body: JSON.stringify({ email: targetEmail, tracking_id: targetId }),
      });
      if (res.ok) {
        setTrackResult(res.data);
      } else {
        showToast(res.error || "Berkas lamaran atau Tracking ID tidak ditemukan", "error");
        setTrackResult(null);
      }
    } catch (err) {
      showToast("Gagal memeriksa status berkas lamaran", "error");
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleConfirmOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackResult) return;
    setIsSubmittingOfferConfirm(true);
    try {
      const res = await apiFetch("/api/hr/track/respond", {
        method: "POST",
        body: JSON.stringify({
          email: trackResult.email || trackEmail,
          tracking_id: trackResult.id || trackId,
          ...offerConfirmForm,
        }),
      });
      if (res.ok && res.data) {
        setTrackResult(res.data.data || res.data);
        showToast(
          res.data.message || "Konfirmasi penerimaan Offering Letter berhasil dikirim ke HRIS!",
          "success",
        );
      } else {
        showToast(res.error || "Gagal menyimpan konfirmasi penawaran kerja", "error");
      }
    } catch {
      showToast("Kesalahan jaringan saat menyimpan konfirmasi", "error");
    } finally {
      setIsSubmittingOfferConfirm(false);
    }
  };

  const handlePrintOfferingLetter = async () => {
    if (!trackResult || !offeringLetterRef.current) return;
    setIsPrintingOffer(true);
    try {
      await generatePDF(
        offeringLetterRef.current,
        `Offering_Letter_${trackResult.id}_${(trackResult.name || "Kandidat").replace(/\s+/g, "_")}.pdf`,
      );
      showToast("Offering Letter Resmi (PDF) berhasil diunduh!", "success");
    } catch {
      showToast("Gagal membuat dokumen PDF Offering Letter", "error");
    } finally {
      setIsPrintingOffer(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      showToast(
        "Hanya dokumen PDF, DOC, DOCX, JPG, atau PNG yang diperbolehkan.",
        "error",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      showToast("Ukuran berkas melebihi batas maksimal 5MB.", "error");
      return;
    }

    try {
      setUploadingFile(true);
      const data = new FormData();
      data.append("file", file);

      const res = await apiFetch("/api/upload", {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setUploadedFileUrl(res.data.url || res.data.fileUrl);
        setUploadedFileName(file.name);
        showToast("Berkas resume berhasil diunggah!", "success");
      } else {
        throw new Error(res.error || "Gagal mengunggah berkas");
      }
    } catch (e) {
      console.error(e);
      showToast("Terjadi kesalahan saat mengunggah berkas.", "error");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const departments = [
    "All",
    ...Array.from(
      new Set(jobs.map((j) => normalizeDepartmentToRole(j.department))),
    ),
  ];

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept =
      selectedDept === "All" ||
      normalizeDepartmentToRole(job.department) === selectedDept;
    return matchesSearch && matchesDept;
  });

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    if (
      !formData.name.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim()
    ) {
      showToast("Harap lengkapi semua kolom wajib.", "error");
      return;
    }

    if (!uploadedFileUrl) {
      showToast(
        "Harap pilih dan unggah dokumen CV / Resume Anda terlebih dahulu.",
        "error",
      );
      return;
    }

    try {
      setFormSubmitting(true);
      trackJobApplyClick({ id: selectedJob.id, title: selectedJob.title });

      // Combine resume url and cover letter details in resume_text
      const finalResumeText = `[RESUME FILE]: ${uploadedFileUrl}\n\n${formData.coverLetter}`;

      const payload = {
        job_id: selectedJob.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        linkedin_url: formData.linkedin,
        experience: formData.experience,
        resume_text: finalResumeText,
      };

      const res = await apiFetch("/api/hr/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const submittedEmail = formData.email;
        const generatedId = res.data?.id || "N/A";
        setFormSuccess(true);
        setApplicationId(generatedId);
        setTrackEmail(submittedEmail);
        setTrackId(generatedId);
        showToast("Lamaran pekerjaan Anda berhasil dikirim ke tim HRD!", "success");
        setFormData({
          name: "",
          email: "",
          phone: "",
          linkedin: "",
          experience: "",
          coverLetter: "",
        });
        setUploadedFileUrl("");
        setUploadedFileName("");
      } else {
        throw new Error(res.error || "Gagal mengirim berkas lamaran");
      }
    } catch (err: any) {
      console.error(err);
      showToast(
        err.message || "Terjadi kesalahan sistem. Silakan coba kembali.",
        "error",
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  // Helper to parse lists
  const parseList = (jsonOrString: string): string[] => {
    try {
      if (!jsonOrString) return [];
      if (jsonOrString.startsWith("[")) {
        return JSON.parse(jsonOrString);
      }
      return jsonOrString.split("\n").filter((line) => line.trim().length > 0);
    } catch (e) {
      return [jsonOrString];
    }
  };

  const publicCms = usePublicCmsConfig();
  const publicEventActive = isAnnualEventActive(publicCms);
  const sceneThemeActive = publicEventActive && publicCms.event_scene_auto_theme;
  const harmonized = sceneThemeActive
    ? harmonizeScenePalette({
        primary: publicCms.event_primary_color || "#047857",
        secondary: publicCms.event_secondary_color || "#b45309",
        surfaceTint: publicCms.event_surface_tint || "#ecfdf5",
        badgeText: publicCms.event_badge_text_color || "#065f46",
      })
    : {
        primary: "#b02524",
        secondary: "#8d1d1c",
        surfaceTint: "#fff1f2",
        badgeText: "#8d1d1c",
      };

  return (
    <div className="bg-stone-50 min-h-screen text-stone-900 font-sans pb-0 flex flex-col">
      <PublicHeader />

      {/* Hero Banner with Harmonized Monochromatic Scene Gradient & Seamless Top/Bottom Dissolve */}
      <section
        className="text-white pt-16 pb-24 lg:pt-24 lg:pb-32 px-4 relative overflow-hidden"
        style={{
          background: `linear-gradient(175deg, ${harmonized.primary} 0%, ${harmonized.secondary} 78%, #292524 100%)`,
        }}
      >
        {/* Top Soft Atmospheric Feather from Header/Ornament into Hero */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-14 z-0"
          style={{
            background: `linear-gradient(180deg, ${harmonized.surfaceTint}38 0%, rgba(0,0,0,0) 100%)`,
          }}
          aria-hidden="true"
        />

        <div className="absolute inset-0 opacity-10 pointer-events-none">
          {/* Subtle grid pattern background */}
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at center, #fff 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
        </div>

        <div className="container mx-auto max-w-5xl text-center relative z-10 transition-all duration-300">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="public-glass-badge-dark inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold text-white mb-6 uppercase tracking-widest"
          >
            <Sparkles className="w-3.5 h-3.5 text-white/95 relative z-10" />
            <span className="relative z-10">
              {cmsContent?.hero_label || "Bergabung Bersama Kami"}
            </span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4"
          >
            {cmsContent?.hero_title || "Membangun Masa Depan Infrastruktur Berkualitas"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/90 text-sm md:text-base max-w-2xl mx-auto leading-relaxed"
          >
            {cmsContent?.hero_subtitle ||
              "Kami percaya keunggulan bermula dari dedikasi insan terbaik. Bergabunglah bersama CV Batu Emas Group untuk membangun karir cemerlang di industri manufaktur paving block dan beton pracetak modern."}
          </motion.p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              onClick={() => {
                const el = document.getElementById("jobs-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-6 py-3 bg-white hover:bg-stone-100 font-extrabold rounded-xl text-sm uppercase tracking-wider transition-all shadow-md cursor-pointer"
              style={{ color: harmonized.badgeText }}
            >
              Jelajahi Lowongan Kerja
            </button>
            <button
              onClick={() => setIsTracking(true)}
              className="px-6 py-3 bg-white/12 border border-white/25 hover:bg-white/20 text-white font-bold rounded-xl text-sm uppercase tracking-wider transition-colors cursor-pointer"
            >
              Lacak Status Berkas Lamaran
            </button>
          </div>
        </div>

        {/* Seamless Multi-Stop Bottom Fade-Out Gradient from Banner into Stone-50 Page Background */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
          style={{
            background:
              "linear-gradient(180deg, rgba(250,250,249,0) 0%, rgba(250,250,249,0.45) 55%, #fafaf9 100%)",
          }}
          aria-hidden="true"
        />
      </section>

      {/* Main Content Area */}
      <main
        id="jobs-section"
        className="container mx-auto px-4 py-16 lg:py-24 max-w-7xl flex-1 -mt-8 lg:-mt-12 relative z-20"
      >
        <AnimatePresence mode="wait">
          {apiError ? (
            <motion.div
              key="error-fallback"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white border-2 border-red-100 rounded-3xl p-12 text-center max-w-2xl mx-auto shadow-sm"
            >
              <h3 className="text-xl font-bold text-red-900 mb-2">
                Layanan Saat Ini Sedang Sibuk
              </h3>
              <p className="text-red-700 text-sm mb-6">
                Sistem HRIS internal kami sedang tidak dapat terhubung. Anda
                dapat mengirimkan CV Anda melalui surel ke{" "}
                <b>hrd@batuemas.com</b>.
              </p>
              <button
                onClick={() => fetchData()}
                className="text-xs font-bold uppercase tracking-wider bg-red-50 text-red-700 py-2 px-4 rounded-xl hover:bg-red-100"
              >
                Coba Ulang Hubungan
              </button>
            </motion.div>
          ) : !selectedJob ? (
            <motion.div
              key="list-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Search & Theme Headers */}
              <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="w-full md:max-w-md">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari posisi lowongan atau keahlian yang dibutuhkan..."
                    leftIcon={
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    }
                  />
                </div>

                {/* Department Filters */}
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end overflow-x-auto pb-1 md:pb-0">
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => {
                        setSelectedDept(dept);
                        trackFilter("Departemen Karir", dept, "CAREERS");
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap uppercase tracking-wider ${
                        selectedDept === dept
                          ? "bg-[#b02524] text-white shadow-md"
                          : "bg-stone-100 hover:bg-stone-200 text-stone-600"
                      }`}
                    >
                      {dept === "All" ? "Semua Divisi" : getDepartmentLabel(dept)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jobs Grid/List */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-stone-200 border-t-[#b02524] rounded-full animate-spin mb-4" />
                  <p className="text-stone-500 font-semibold text-xs uppercase tracking-wider">
                    Memuat Lowongan Pekerjaan...
                  </p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-sm">
                  <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-stone-100">
                    <Briefcase className="w-7 h-7 text-stone-400" />
                  </div>
                  <h3 className="font-bold text-lg text-stone-800 mb-1">
                    Belum Ada Lowongan Terbuka
                  </h3>
                  <p className="text-stone-500 text-sm mb-6">
                    Saat ini belum ada posisi lowongan yang cocok dengan kriteria pencarian Anda. Silakan cek kembali secara berkala atau atur ulang filter pencarian!
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedDept("All");
                    }}
                    className="px-4 py-2.5 bg-[#b02524] hover:bg-[#961f1e] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Atur Ulang Filter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredJobs.map((job) => (
                    <motion.div
                      layout
                      key={job.id}
                      onClick={() => {
                        setSelectedJob(job);
                        trackJobView({ id: job.id, title: job.title, department: job.department, location: job.location });
                      }}
                      className="bg-white border border-stone-200 hover:border-[#b02524]/50 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between group"
                    >
                      <div>
                        {/* Bullet / Division Tag */}
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-3 py-1 bg-stone-100 text-[10px] font-bold text-stone-600 rounded-lg uppercase tracking-wider">
                            {getDepartmentLabel(job.department)}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>

                        {/* Position Title */}
                        <h3 className="font-extrabold text-lg text-stone-900 group-hover:text-[#b02524] transition-colors line-clamp-2 leading-snug">
                          {job.title}
                        </h3>

                        {/* Specs */}
                        <div className="flex flex-col gap-2.5 mt-4 text-xs text-stone-500 font-semibold uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{job.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{job.type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Coins className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span className="text-stone-800 font-mono tabular-nums lowercase first-letter:uppercase">
                              {formatSalaryString(job.salary_string)}
                            </span>
                          </div>
                        </div>

                        <p className="text-stone-600 text-xs line-clamp-3 mt-4 leading-relaxed">
                          {job.description}
                        </p>
                      </div>

                      {/* Apply button link */}
                      <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-[10px] font-extrabold font-mono tabular-nums text-stone-400 uppercase tracking-widest">
                          ID: {job.id.slice(0, 10)}
                        </span>
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#b02524] group-hover:translate-x-1 transition-transform">
                          <span>Selengkapnya</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="detail-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-4xl mx-auto"
            >
              {/* Back Button */}
              <button
                onClick={() => {
                  setSelectedJob(null);
                  setIsApplying(false);
                  setFormSuccess(false);
                }}
                className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors font-bold text-xs uppercase tracking-widest mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Daftar Lowongan
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Description Column */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Job Detail Header Card */}
                  <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm">
                    <span className="inline-block px-3 py-1 bg-stone-100 text-[10px] font-bold uppercase tracking-wider text-stone-600 rounded-lg mb-4">
                      {getDepartmentLabel(selectedJob.department)}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight leading-snug mb-4">
                      {selectedJob.title}
                    </h2>

                    <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-stone-500 font-bold uppercase tracking-wider pt-4 border-t border-stone-100">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-stone-400" />
                        <span>{selectedJob.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-stone-400" />
                        <span>{selectedJob.type}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-stone-400" />
                        <span className="text-stone-800 lowercase first-letter:uppercase">
                          {formatSalaryString(selectedJob.salary_string)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Responsibilities */}
                  <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-base text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                      Tanggung Jawab &amp; Ruang Lingkup Pekerjaan
                    </h3>
                    <p className="text-stone-600 text-sm leading-relaxed whitespace-pre-line">
                      {selectedJob.description}
                    </p>
                  </div>

                  {/* Requirements list */}
                  {parseList(selectedJob.requirements).length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm space-y-4">
                      <h3 className="font-extrabold text-base text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                        Kualifikasi &amp; Persyaratan Kandidat
                      </h3>
                      <ul className="space-y-3">
                        {parseList(selectedJob.requirements).map((req, idx) => (
                          <li
                            key={idx}
                            className="flex gap-3 text-stone-600 text-sm leading-relaxed"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#b02524] shrink-0 mt-2" />
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Benefits */}
                  {parseList(selectedJob.benefits).length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm space-y-4">
                      <h3 className="font-extrabold text-base text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                        Fasilitas &amp; Kompensasi Kerja
                      </h3>
                      <ul className="space-y-3">
                        {parseList(selectedJob.benefits).map((benefit, idx) => (
                          <li
                            key={idx}
                            className="flex gap-3 text-stone-600 text-sm leading-relaxed"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Sidebar Sticky Apply Form */}
                <div className="lg:col-span-1">
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm sticky top-24 space-y-6">
                    {!isApplying ? (
                      <div className="text-center py-4 space-y-4">
                        <div className="w-12 h-12 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-center mx-auto text-stone-400">
                          <Building className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-sm text-stone-900">
                            Bergabung Bersama Tim Paving Joss
                          </h4>
                          <p className="text-xs text-stone-500">
                            Kirimkan berkas lamaran Anda hari ini! Tim rekrutmen kami akan meninjau kualifikasi dan menghubungi kandidat terpilih.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsApplying(true)}
                          className="w-full py-3.5 bg-[#b02524] hover:bg-[#921e1d] text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>Lamar Posisi Ini</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ) : formSuccess ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-8 space-y-4"
                      >
                        <div className="w-16 h-16 bg-emerald-100 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="font-extrabold text-base text-stone-950">
                            Lamaran Berhasil Diterima!
                          </h4>
                          <p className="text-xs text-stone-500 leading-relaxed">
                            Terima kasih atas minat Anda. Berkas profil kandidat Anda telah tercatat dengan aman di database HRIS kami.
                          </p>
                          <div className="bg-stone-50 p-4 border border-stone-200 rounded-xl my-4">
                            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mb-1">
                              Nomor ID Pelacakan Anda
                            </p>
                            <p className="text-xl font-mono text-stone-900 font-bold select-all">
                              {applicationId}
                            </p>
                            <p className="text-xs text-stone-500 mt-2">
                              Gunakan ID Pelacakan ini bersama alamat email Anda untuk memeriksa perkembangan seleksi kapan saja.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsTracking(true);
                              handleTrackSubmit(undefined, trackEmail, applicationId);
                            }}
                            className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-xs"
                          >
                            Lacak Status Lamaran Sekarang
                          </button>
                          <button
                            onClick={() => {
                              setSelectedJob(null);
                              setIsApplying(false);
                              setFormSuccess(false);
                              setUploadedFileUrl("");
                              setUploadedFileName("");
                            }}
                            className="w-full py-3 bg-[#b02524] hover:bg-[#961f1e] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs"
                          >
                            Kembali ke Daftar Lowongan
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-4"
                      >
                        <div className="flex justify-between items-center pb-3 border-b border-stone-150">
                          <h4 className="font-extrabold text-sm text-stone-900 uppercase tracking-tight">
                            Formulir Pendaftaran Kerja
                          </h4>
                          <button
                            onClick={() => {
                              setIsApplying(false);
                              setUploadedFileUrl("");
                              setUploadedFileName("");
                            }}
                            className="text-xs text-stone-400 hover:text-stone-900 font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>

                        <form
                          onSubmit={handleApplySubmit}
                          className="space-y-3.5"
                        >
                          <Input
                            label="Nama Lengkap *"
                            type="text"
                            required
                            placeholder="Contoh: Budi Santoso"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                name: e.target.value,
                              })
                            }
                          />

                          <Input
                            label="Alamat Email *"
                            type="email"
                            required
                            placeholder="Contoh: budi.santoso@gmail.com"
                            value={formData.email}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                email: e.target.value,
                              })
                            }
                          />

                          <Input
                            label="Nomor WhatsApp / Telepon *"
                            type="tel"
                            required
                            placeholder="Contoh: 0812-3456-7890"
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                phone: e.target.value,
                              })
                            }
                            className="font-mono tabular-nums"
                          />

                          <Input
                            label="Tautan Profil LinkedIn (Opsional)"
                            type="url"
                            placeholder="Contoh: linkedin.com/in/budisantoso"
                            value={formData.linkedin}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                linkedin: e.target.value,
                              })
                            }
                          />

                          <Textarea
                            label="Ringkasan Pengalaman Kerja / Profil Singkat *"
                            required
                            rows={3}
                            placeholder="Tuliskan ringkasan pengalaman dan keahlian Anda (contoh: 3 tahun di industri manufaktur atau operator mesin)..."
                            value={formData.experience}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                experience: e.target.value,
                              })
                            }
                          />

                          <Textarea
                            label="Surat Lamaran / Catatan Tambahan"
                            rows={3}
                            placeholder="Perkenalkan diri Anda secara singkat dan ceritakan motivasi Anda melamar posisi ini..."
                            value={formData.coverLetter}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                coverLetter: e.target.value,
                              })
                            }
                          />

                          {/* Beautiful Interactive Drag and Drop Resume File field */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                              Unggah Dokumen CV / Resume *
                            </label>

                            {!uploadedFileUrl ? (
                              <div
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                                  dragActive
                                    ? "border-[#b02524] bg-[#b02524]/5"
                                    : "border-stone-250 bg-stone-50 hover:bg-stone-100/60"
                                } flex flex-col items-center justify-center cursor-pointer relative min-h-[110px]`}
                              >
                                {uploadingFile ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-stone-300 border-t-[#b02524] rounded-full animate-spin" />
                                    <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider animate-pulse">
                                      Sedang mengunggah berkas...
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <UploadCloud className="w-8 h-8 text-stone-400 mb-1.5" />
                                    <p className="text-xs font-semibold text-stone-700">
                                      Tarik berkas ke sini atau klik untuk memilih
                                    </p>
                                    <p className="text-[9px] text-stone-400 uppercase font-semibold">
                                      Maksimal 5MB (Format: PDF, DOCX, JPG, PNG)
                                    </p>
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                      onChange={handleChangeFile}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <FileText className="w-5 h-5 text-[#b02524] shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-stone-800 truncate">
                                      {uploadedFileName}
                                    </p>
                                    <p className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wider">
                                      BERKAS SIAP DIKIRIM
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadedFileUrl("");
                                    setUploadedFileName("");
                                  }}
                                  className="p-1.5 hover:bg-stone-250 rounded-lg text-stone-400 hover:text-stone-700 transition cursor-pointer"
                                  aria-label="Hapus Berkas"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={formSubmitting || uploadingFile}
                            className="w-full py-4 bg-[#b02524] hover:bg-[#921e1d] disabled:opacity-50 text-white font-extrabold text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {formSubmitting
                              ? "Mengirimkan Berkas Lamaran..."
                              : "Kirim Lamaran Sekarang"}
                          </button>
                        </form>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Modal
        isOpen={isTracking}
        onClose={() => setIsTracking(false)}
        maxWidth="xl"
        contentClassName="p-6 sm:p-8"
        title={
          <h3 className="text-xl font-bold text-stone-900 tracking-tight">
            Portal Pelacakan Lamaran &amp; Offering Letter
          </h3>
        }
      >
        <p className="text-xs sm:text-sm text-stone-500 mb-5">
          Masukkan alamat email dan nomor referensi Tracking ID Anda untuk memantau tahapan seleksi, mengunduh <strong>Offering Letter Resmi (PDF)</strong>, serta mengonfirmasi kesiapan bergabung.
        </p>
        <form onSubmit={(e) => handleTrackSubmit(e)} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5">
            <Input
              label="Alamat Email Kandidat"
              type="email"
              value={trackEmail}
              onChange={(e) => setTrackEmail(e.target.value)}
              required
              placeholder="candidate@example.com"
            />
          </div>
          <div className="sm:col-span-4">
            <Input
              label="Tracking ID Lamaran"
              type="text"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              required
              className="font-mono tabular-nums font-bold"
              placeholder="APP-XXXXXX"
            />
          </div>
          <div className="sm:col-span-3">
            <Button
              type="submit"
              variant="primary"
              isLoading={trackingLoading}
              className="w-full bg-[#b02524] hover:bg-[#961f1e] border-[#b02524]"
            >
              {trackingLoading ? "Mencari..." : "Cek Status"}
            </Button>
          </div>
        </form>

        {trackResult && (
          <div className="mt-6 space-y-4">
            {/* Candidate Summary Header */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-widest block">
                    Kandidat Terdaftar • <span className="font-mono text-stone-700">{trackResult.id}</span>
                  </span>
                  <h4 className="text-base font-extrabold text-stone-900 mt-0.5">
                    {trackResult.name || "Kandidat"} — {trackResult.job_title}
                  </h4>
                  <p className="text-xs font-semibold text-stone-500">
                    Divisi {trackResult.department} • {trackResult.location || "Head Office"} • Melamar pada{" "}
                    {new Date(trackResult.applied_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <Badge
                  variant={
                    trackResult.status === "ACCEPTED"
                      ? "success"
                      : trackResult.status === "OFFER_MADE"
                      ? "warning"
                      : trackResult.status === "REJECTED"
                      ? "danger"
                      : "info"
                  }
                  size="md"
                >
                  {trackResult.status === "ACCEPTED"
                    ? "Diterima / Onboarded"
                    : trackResult.status === "OFFER_MADE"
                    ? "Penawaran Kerja (PKWT)"
                    : trackResult.status === "INTERVIEW"
                    ? "Tahap Wawancara"
                    : trackResult.status === "SCREENING"
                    ? "Tahap Skrining"
                    : trackResult.status === "REJECTED"
                    ? "Belum Lolos"
                    : "Berkas Terkirim"}
                </Badge>
              </div>

              {/* 5-Stage Recruitment Progress Stepper */}
              {trackResult.status !== "REJECTED" && (
                <div className="pt-3 border-t border-stone-200/80">
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    {[
                      { id: "APPLIED", label: "1. Berkas Masuk" },
                      { id: "SCREENING", label: "2. Skrining Awal" },
                      { id: "INTERVIEW", label: "3. Wawancara" },
                      { id: "OFFER_MADE", label: "4. Penawaran (PKWT)" },
                      { id: "ACCEPTED", label: "5. Karyawan Baru" },
                    ].map((st, idx) => {
                      const order = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER_MADE", "ACCEPTED"];
                      const currentIdx = order.indexOf(trackResult.status);
                      const isDone = currentIdx >= idx;
                      const isCurrent = currentIdx === idx;
                      return (
                        <div
                          key={st.id}
                          className={`p-2 rounded-xl border text-[10px] font-bold transition-all ${
                            isCurrent
                              ? "bg-[#b02524] text-white border-[#b02524] shadow-2xs"
                              : isDone
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-white text-stone-400 border-stone-200/70"
                          }`}
                        >
                          {st.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {trackResult.notes && (
                <div className="p-3 rounded-xl bg-white border border-stone-200 text-xs text-stone-600 whitespace-pre-line">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                    Catatan &amp; Riwayat Seleksi HRD:
                  </span>
                  {trackResult.notes}
                </div>
              )}
            </div>

            {/* Offering Letter & Self-Service Confirmation Hub (Visible when OFFER_MADE or ACCEPTED) */}
            {(trackResult.status === "OFFER_MADE" ||
              trackResult.status === "ACCEPTED" ||
              trackResult.status === "INTERVIEW") && (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/60 border border-amber-200/90 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/70">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-800 block">
                      Dokumen Resmi HRIS &amp; Onboarding
                    </span>
                    <h5 className="text-sm font-black text-stone-900">
                      Surat Penawaran Kerja (Offering Letter) &amp; Konfirmasi Kandidat
                    </h5>
                  </div>
                  <button
                    type="button"
                    disabled={isPrintingOffer}
                    onClick={handlePrintOfferingLetter}
                    className="px-4 py-2 rounded-lg bg-[#b02524] hover:bg-[#8e1d1c] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5 text-white" />
                    <span>
                      {isPrintingOffer ? "Menyiapkan PDF..." : "Cetak Offering Letter (PDF)"}
                    </span>
                  </button>
                </div>

                {trackResult.onboarding_token && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Token Onboarding Aktif (Tersinkronisasi ke HRIS)
                      </span>
                      <span className="text-xs text-emerald-900 font-medium">
                        Simpan token ini untuk aktivasi akun karyawan &amp; ESS bersama tim HRD.
                      </span>
                    </div>
                    <span className="font-mono font-black text-sm text-emerald-900 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 select-all">
                      {trackResult.onboarding_token}
                    </span>
                  </div>
                )}

                <form onSubmit={handleConfirmOfferSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <Input
                      label="Kesiapan Tanggal Mulai *"
                      type="date"
                      required
                      value={offerConfirmForm.join_date}
                      onChange={(e) =>
                        setOfferConfirmForm({ ...offerConfirmForm, join_date: e.target.value })
                      }
                      className="font-mono tabular-nums"
                    />
                    <Input
                      label="Nomor NIK KTP (Onboarding) *"
                      type="text"
                      required
                      placeholder="16 Digit NIK KTP"
                      value={offerConfirmForm.id_card_number}
                      onChange={(e) =>
                        setOfferConfirmForm({
                          ...offerConfirmForm,
                          id_card_number: e.target.value,
                        })
                      }
                      className="font-mono tabular-nums"
                    />
                    <Select
                      label="Status PTKP (Pajak PPh 21)"
                      value={offerConfirmForm.ptkp_status}
                      onChange={(e) =>
                        setOfferConfirmForm({
                          ...offerConfirmForm,
                          ptkp_status: e.target.value,
                        })
                      }
                      options={["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"].map(
                        (ptkp) => ({ value: ptkp, label: ptkp }),
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Input
                      label="Nomor NPWP (Opsional)"
                      type="text"
                      placeholder="Nomor NPWP Pribadi"
                      value={offerConfirmForm.npwp}
                      onChange={(e) =>
                        setOfferConfirmForm({
                          ...offerConfirmForm,
                          npwp: e.target.value,
                        })
                      }
                      className="font-mono tabular-nums"
                    />
                    <Input
                      label="Info Bank & No. Rekening Payroll"
                      type="text"
                      placeholder="BCA / Mandiri - No. Rek"
                      value={offerConfirmForm.bank_account_info}
                      onChange={(e) =>
                        setOfferConfirmForm({
                          ...offerConfirmForm,
                          bank_account_info: e.target.value,
                        })
                      }
                    />
                  </div>

                  <Input
                    label="Pernyataan Konfirmasi & Catatan Tambahan"
                    type="text"
                    placeholder="Contoh: Saya menerima penawaran kerja ini dan siap melengkapi dokumen fisik saat hari pertama."
                    value={offerConfirmForm.candidate_notes}
                    onChange={(e) =>
                      setOfferConfirmForm({
                        ...offerConfirmForm,
                        candidate_notes: e.target.value,
                      })
                    }
                  />

                  <Button
                    type="submit"
                    variant="success"
                    isLoading={isSubmittingOfferConfirm}
                    leftIcon={<CheckCircle2 className="w-4 h-4" />}
                    className="w-full"
                  >
                    {isSubmittingOfferConfirm
                      ? "Menyimpan ke HRIS..."
                      : "Terima Penawaran Kerja & Kirim Data Onboarding ke HRIS"}
                  </Button>
                </form>
              </div>
            )}

            {/* Offscreen A4 Offering Letter Template for PDF Generation */}
            <div className="fixed -left-[9999px] top-0 pointer-events-none">
              <div
                ref={offeringLetterRef}
                className="w-[794px] min-h-[1123px] bg-white p-12 text-stone-900 font-sans flex flex-col justify-between"
              >
                <div className="space-y-6">
                  <div className="border-b-2 border-[#b02524] pb-5 flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-black uppercase tracking-tight text-stone-900">
                        CV. BATU EMAS GROUP (PAVING JOSS)
                      </h1>
                      <p className="text-xs text-stone-600 mt-1">
                        Dusun Petahunan, Kecamatan Gambiran, Kabupaten Banyuwangi, Jawa Timur 68486
                      </p>
                      <p className="text-xs text-stone-500 font-mono mt-0.5">
                        Telp: 0811-1111-3993 • Email: hrd@batuemas.com / pavingjoss@gmail.com
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#b02524] bg-red-50 px-2.5 py-1 rounded border border-red-200">
                        OFFICIAL OFFERING LETTER
                      </span>
                      <p className="text-xs font-mono font-bold text-stone-700 mt-2">
                        Ref: OL/{new Date().getFullYear()}/{trackResult.id}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-700 space-y-1">
                    <p>
                      Banyuwangi,{" "}
                      {new Date().toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <p className="font-bold pt-2">Kepada Yth.</p>
                    <p className="text-sm font-black text-stone-900">{trackResult.name}</p>
                    <p className="font-mono text-stone-600">{trackResult.email} • {trackResult.phone}</p>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-stone-800">
                    <p className="font-bold text-sm text-stone-900">
                      Perihal: Surat Penawaran Kerja Resmi (Offering Letter) — {trackResult.job_title}
                    </p>
                    <p>
                      Berdasarkan hasil evaluasi kualifikasi dan tahapan seleksi yang telah Anda lalui dengan sangat baik, Manajemen <strong>CV. Batu Emas Group (Paving Joss)</strong> dengan bangga menyampaikan penawaran kerja resmi kepada Anda dengan rincian sebagai berikut:
                    </p>
                  </div>

                  <div className="p-5 rounded-xl bg-stone-50 border border-stone-200 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Jabatan / Posisi
                      </span>
                      <span className="font-bold text-stone-900 text-sm">{trackResult.job_title}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Departemen / Divisi
                      </span>
                      <span className="font-bold text-stone-900 text-sm">{trackResult.department}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Lokasi Penempatan
                      </span>
                      <span className="font-semibold text-stone-800">
                        {trackResult.location || "Pabrik Utama Gambiran, Banyuwangi"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Status Kekaryawanan
                      </span>
                      <span className="font-semibold text-stone-800">
                        {trackResult.job_type || "Full-time"}
                      </span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-stone-200">
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Paket Kompensasi &amp; Remunerasi Bulanan
                      </span>
                      <span className="font-mono font-black text-base text-[#b02524]">
                        {formatSalaryString(trackResult.salary_string)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs leading-relaxed text-stone-700">
                    <p>
                      Penawaran ini terintegrasi langsung dengan sistem <strong>HRIS &amp; Payroll CV. Batu Emas Group</strong>. Setelah Anda mengonfirmasi penerimaan tawaran kerja ini melalui Portal Karir, akun pengguna ERP/ESS, pengaturan gaji pokok, serta penugasan divisi Anda akan segera diaktifkan.
                    </p>
                  </div>
                </div>

                <div className="pt-10 border-t border-stone-200 flex items-end justify-between text-xs">
                  <div>
                    <p className="font-bold text-stone-900">Divisi Human Capital &amp; HRIS</p>
                    <p className="text-stone-500 mb-8">CV. Batu Emas Group</p>
                    <div className="inline-block px-3 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold">
                      DIGITALLY VERIFIED • {trackResult.id}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-stone-900">Persetujuan Kandidat,</p>
                    <p className="text-stone-500 mb-10">Dikonfirmasi Secara Elektronik</p>
                    <p className="font-bold text-stone-900 underline">{trackResult.name}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <PublicFooter />
    </div>
  );
}
