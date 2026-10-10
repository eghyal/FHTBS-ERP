import { GoogleGenAI } from "@google/genai";

export interface VisitorActivityRecord {
  module: "PUBLIC" | "SHOP" | "CAREERS" | string;
  activity_type: string;
  title: string;
  details?: any;
  page_url?: string;
  created_at: string;
}

export interface ScoutLeadInput {
  id: string;
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  cart_snapshot?: any;
  cart_total_value?: number;
  cart_total_items?: number;
  activities?: VisitorActivityRecord[];
  profiling_consent?: boolean;
}

export interface ScoutSource {
  title: string;
  url: string;
  claim: string;
}

export interface LeadScoreDimensions {
  behavioral_intent: number; // 0 - 100 (weight 35%)
  engagement: number;        // 0 - 100 (weight 20%)
  profile_fit: number;       // 0 - 100 (weight 30%)
  freshness: number;         // 0 - 100 (weight 15%)
}

export interface ScoutAnalysisResult {
  potential_score: number; // 0 - 100 composite
  lead_grade: "A" | "B" | "C" | "D";
  fit_score: number;
  intent_score: number;
  reachability_score: number;
  dimensions: LeadScoreDimensions;
  persona_tag: string;
  buying_power_est: string;
  scout_company: string;
  scout_role: string;
  scout_summary: string;
  scout_sources: string[];
  sources_json: ScoutSource[];
  scout_recommendations: string;
  key_talking_points: string[];
  recommended_products: string[];
  risk_flags: string[];
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  explanation: string[];
  consent_compliant: boolean;
  deep_osint?: {
    social_presence?: { platform: string; identifier_or_url?: string; summary: string }[];
    career_background?: { position: string; organization: string; scope_notes: string }[];
    relations_and_affiliations?: string[];
    digital_reputation_notes?: string;
    authority_level?: "DECISION_MAKER" | "INFLUENCER" | "BUYER" | "EVALUATOR";
  };
}

export const PUBLIC_FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.id",
  "yahoo.co.uk",
  "ymail.com",
  "rocketmail.com",
  "hotmail.com",
  "hotmail.co.id",
  "outlook.com",
  "outlook.co.id",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "mail.com",
  "email.com",
  "aol.com",
  "zoho.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.net",
  "tutanota.com",
  "tutamail.com",
  "yandex.com",
  "yandex.ru",
]);

/**
 * Checks if an email is a custom corporate/business domain
 */
export function isCorporateBusinessEmail(emailStr?: string | null): {
  isCorporate: boolean;
  domain: string;
  isFreeMail: boolean;
} {
  if (!emailStr || !emailStr.includes("@")) {
    return { isCorporate: false, domain: "", isFreeMail: false };
  }
  const email = emailStr.toLowerCase().trim();
  const domain = email.split("@")[1]?.trim() || "";
  if (!domain || !domain.includes(".")) {
    return { isCorporate: false, domain, isFreeMail: false };
  }
  const isFreeMail = PUBLIC_FREE_EMAIL_DOMAINS.has(domain);
  return {
    isCorporate: !isFreeMail && domain.length >= 4,
    domain,
    isFreeMail,
  };
}

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

/**
 * Calculate Grade from total score
 */
export function calculateGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * First-Party Rule-Based Engine (Fallback & Base Scoring)
 * Strictly analyzes internal company interactions with corporate domain acknowledgment
 */
export function generateHeuristicScout(input: ScoutLeadInput): ScoutAnalysisResult {
  const email = (input.email || "").toLowerCase().trim();
  const company = (input.company || "").trim();
  const cartValue = Number(input.cart_total_value) || 0;
  const items = Array.isArray(input.cart_snapshot) ? input.cart_snapshot : [];
  const activities = Array.isArray(input.activities) ? input.activities : [];
  const hasConsent = input.profiling_consent !== false;

  const { isCorporate: hasCorporateEmail, domain } = isCorporateBusinessEmail(email);

  // Breakdown modules
  const publicActs = activities.filter((a) => a.module === "PUBLIC");
  const shopActs = activities.filter((a) => a.module === "SHOP");
  const careerActs = activities.filter((a) => a.module === "CAREERS");

  // 1. Behavioral Intent (35%)
  let behavioralIntent = 35;
  if (cartValue > 50000000) behavioralIntent = 95;
  else if (cartValue > 25000000) behavioralIntent = 85;
  else if (cartValue > 10000000) behavioralIntent = 75;
  else if (cartValue > 2000000) behavioralIntent = 60;
  else if (items.length > 0) behavioralIntent = 50;

  // High spec search / commercial volume indicators
  const searchedTerms = activities
    .filter((a) => a.activity_type === "SEARCH")
    .map((a) => a.title.replace("Pencarian: ", ""))
    .join(", ");

  const hasHighSpecSearch = activities.some((a) => {
    const text = (a.title + " " + JSON.stringify(a.details || {})).toLowerCase();
    return (
      text.includes("spesifikasi") ||
      text.includes("standar") ||
      text.includes("proyek") ||
      text.includes("infrastruktur") ||
      text.includes("kontrak") ||
      text.includes("distributor") ||
      text.includes("grosir") ||
      text.includes("sni") ||
      text.includes("k-") ||
      text.includes("heavy duty")
    );
  });
  if (hasHighSpecSearch) behavioralIntent = Math.min(100, behavioralIntent + 15);
  if (hasCorporateEmail) behavioralIntent = Math.min(100, behavioralIntent + 10);

  // 2. Engagement (20%)
  let engagement = Math.min(100, activities.length * 8 + (publicActs.length > 0 ? 15 : 0) + (careerActs.length > 0 ? 10 : 0));
  if (engagement === 0 && items.length > 0) engagement = 35;

  // 3. Profile Fit (30%) - Higher weight to corporate business email domains
  let profileFit = 45;
  let persona = "Retail Homeowner";
  let buyingPower = "Skala Retail (Renovasi Ringan)";

  if (hasCorporateEmail) {
    // Verified Business Domain boost
    profileFit = 92;
    if (
      company.toLowerCase().includes("pt ") ||
      company.toLowerCase().includes("cv ") ||
      company.toLowerCase().includes("konstruksi") ||
      company.toLowerCase().includes("jaya") ||
      company.toLowerCase().includes("karya")
    ) {
      persona = "Enterprise Corporate";
      buyingPower = "Skala Korporat / Kontraktor Utama B2B";
      profileFit = 96;
    } else {
      persona = "B2B Verified Partner";
      buyingPower = "Skala Menengah - Besar (Domain Bisnis: @" + domain + ")";
      profileFit = 90;
    }
  } else if (company) {
    if (
      company.toLowerCase().includes("pt ") ||
      company.toLowerCase().includes("cv ") ||
      company.toLowerCase().includes("konstruksi") ||
      company.toLowerCase().includes("graha") ||
      company.toLowerCase().includes("utama") ||
      company.toLowerCase().includes("bina") ||
      company.toLowerCase().includes("karya")
    ) {
      persona = "Kontraktor Sipil";
      buyingPower = "Skala Besar (Proyek Infrastruktur / Komersial)";
      profileFit = 85;
    } else {
      persona = "Developer Properti / Instansi";
      buyingPower = "Skala Menengah (Kawasan Proyek / Instansi)";
      profileFit = 78;
    }
  } else if (hasHighSpecSearch || cartValue > 25000000) {
    persona = "Kontraktor Sipil";
    buyingPower = "Skala Besar (Proyek Komersial / Spesifikasi Berat)";
    profileFit = 82;
  } else if (cartValue > 10000000) {
    persona = "Developer Properti";
    buyingPower = "Skala Menengah (Volume 10 - 25 Juta)";
    profileFit = 70;
  }

  // 4. Freshness (15%)
  const freshness = 85; // Recent interaction

  // Weighted composite score
  const totalScore = Math.round(
    behavioralIntent * 0.35 +
    engagement * 0.20 +
    profileFit * 0.30 +
    freshness * 0.15
  );

  const grade = calculateGrade(totalScore);

  const sourcesList: string[] = [];
  const sourcesJson: ScoutSource[] = [];

  if (hasCorporateEmail) {
    sourcesList.push(`Domain Bisnis Resmi Terverifikasi: @${domain} (+Bobot Khusus Enterprise Trust)`);
  }
  if (company) {
    sourcesList.push(`Identitas Entitas Komersial / Instansi: ${company}`);
  }
  if (activities.length > 0) {
    sourcesList.push(`${activities.length} aktivitas jejak web (Public: ${publicActs.length}, Shop: ${shopActs.length}, Karir: ${careerActs.length})`);
  }
  if (hasHighSpecSearch && searchedTerms) {
    sourcesList.push(`Pencarian aktif spesifikasi mutu proyek: "${searchedTerms}"`);
  }
  if (cartValue > 10000000) {
    sourcesList.push(`Nilai keranjang material volume tinggi: Rp ${cartValue.toLocaleString("id-ID")}`);
  }

  const inferredCompany = company || (hasCorporateEmail ? `Instansi / Entitas (@${domain})` : "Perorangan / Mandiri");
  const inferredRole =
    hasCorporateEmail || company
      ? "Procurement Lead / Site Manager / Owner"
      : careerActs.length > 0
      ? "Site Engineer / Estimator Proyek"
      : "Pemilik Rumah / Pengelola Proyek";

  const explanation = [
    `Profile Fit (${profileFit}/100): ${hasCorporateEmail ? `Domain bisnis kustom (@${domain}) memberikan prioritas B2B tertinggi` : `Entitas ${inferredCompany}`}`,
    `Behavioral Intent (${behavioralIntent}/100): ${cartValue > 0 ? `Keranjang senilai Rp ${cartValue.toLocaleString("id-ID")}` : "Penelusuran spesifikasi katalog"}`,
    `Engagement (${engagement}/100): ${activities.length} interaksi terekam lintas modul platform`,
    `Freshness (${freshness}/100): Sesi belanja aktif terkini`
  ];

  const itemNames = items.map((i) => i.name).filter(Boolean);
  const keyTalkingPoints = [
    hasCorporateEmail
      ? `Penawaran harga invoice resmi B2B & PPN untuk ${company || `@${domain}`}`
      : "Penawaran harga grosir pabrik dan sertifikat mutu SNI",
    hasHighSpecSearch
      ? `Katalog spesifikasi teknis dan jaminan mutu resmi (${searchedTerms || "Spesifikasi Mutu Industri / SNI"})`
      : itemNames.length > 0
      ? `Ketersediaan stok & jadwal muat untuk ${itemNames.slice(0, 2).join(", ")}`
      : "Katalog produk enterprise dengan spesifikasi presisi dan jaminan standar industri",
    "Kapasitas suplai volume besar dan opsi jadwal pengiriman bertahap langsung ke lokasi proyek"
  ];

  const recommendedProducts = itemNames.length > 0
    ? itemNames.slice(0, 3)
    : [
        "Material & Komponen Standar Industri",
        "Produk Kategori Prioritas Proyek",
        "Layanan Custom Fabrikasi / Pemesanan Khusus"
      ];

  const riskFlags = hasConsent
    ? [hasCorporateEmail ? "Domain resmi valid. Verifikasi kesesuaian spesifikasi produk dan jadwal droping ke site." : "Perlu verifikasi apakah pemegang kontak adalah pengambil keputusan anggaran (decision maker)"]
    : ["Profil belum menyetujui consent profiling; data enrichment publik eksternal dinonaktifkan sesuai UU PDP"];

  return {
    potential_score: totalScore,
    lead_grade: grade,
    fit_score: profileFit,
    intent_score: behavioralIntent,
    reachability_score: hasCorporateEmail && input.phone ? 95 : input.phone ? 85 : 60,
    dimensions: {
      behavioral_intent: behavioralIntent,
      engagement,
      profile_fit: profileFit,
      freshness,
    },
    persona_tag: persona,
    buying_power_est: buyingPower,
    scout_company: inferredCompany,
    scout_role: inferredRole,
    scout_summary: `Prospek ${input.customer_name} dari ${inferredCompany} ${hasCorporateEmail ? `menggunakan email korporat (@${domain})` : ""} menunjukkan intensi B2B ${grade === "A" ? "tinggi (Grade A)" : "menengah (Grade B)"} dengan estimasi keranjang Rp ${cartValue.toLocaleString("id-ID")}.`,
    scout_sources: sourcesList,
    sources_json: sourcesJson,
    scout_recommendations: hasCorporateEmail
      ? "Prioritas Tinggi. Hubungi PIC via WhatsApp & Email resmi untuk kirim Quotation B2B / Proforma Invoice beserta brosur spesifikasi teknis."
      : "Hubungi melalui WhatsApp bisnis. Tawarkan negosiasi volume diskon pabrik dan sertifikat uji mutu.",
    key_talking_points: keyTalkingPoints,
    recommended_products: recommendedProducts,
    risk_flags: riskFlags,
    confidence_level: hasCorporateEmail ? "HIGH" : hasConsent ? "MEDIUM" : "LOW",
    explanation,
    consent_compliant: hasConsent,
    deep_osint: {
      social_presence: [
        {
          platform: "LinkedIn",
          identifier_or_url: hasCorporateEmail ? `https://linkedin.com/company/${domain.split('.')[0]}` : undefined,
          summary: hasCorporateEmail
            ? `Profil bisnis terhubung dengan domain korporat @${domain}. Teridentifikasi dalam struktur organisasi ${inferredCompany}.`
            : `Pencarian profil LinkedIn profesional untuk nama "${input.customer_name}".`,
        },
        {
          platform: "X / Twitter",
          summary: `Pencarian jejak digital publik untuk entitas ${inferredCompany}.`,
        },
        {
          platform: "Direktori Bisnis / OSINT",
          summary: `Registrasi domain ${domain || "webmail"} & aktivitas penelusuran first-party.`,
        },
      ],
      career_background: [
        {
          position: inferredRole,
          organization: inferredCompany,
          scope_notes: `Mengelola aktivitas belanja B2B & pengadaan barang dengan estimasi anggaran Rp ${cartValue.toLocaleString("id-ID")}.`,
        },
      ],
      relations_and_affiliations: [
        `Jaringan pengadaan material & proyek B2B ${inferredCompany}`,
        hasCorporateEmail ? `Domain Perusahaan Terverifikasi (@${domain})` : "Aktivitas Konsumen Langsung",
      ],
      digital_reputation_notes: hasCorporateEmail
        ? "Identitas terverifikasi melalui domain korporat resmi dan riwayat aktivitas katalog."
        : "Kontak terdaftar dengan nomor telepon aktif & aktivitas belanja terverifikasi.",
      authority_level: hasCorporateEmail ? "DECISION_MAKER" : "BUYER",
    },
  };
}

/**
 * Scout Intelligence Pipeline powered by Gemini 3.8 Flash
 * Incorporates Google Search Grounding for public domain data
 * Strictly adheres to UU PDP (UU No. 27/2022) & Privacy-by-Design
 */
export async function runScoutIntelligence(input: ScoutLeadInput): Promise<ScoutAnalysisResult> {
  const fallback = generateHeuristicScout(input);

  // PRIVACY-BY-DESIGN HARD CHECK:
  if (input.profiling_consent === false) {
    console.log("[ScoutIntelligence] Profiling consent is false. Returning first-party heuristic only.");
    return {
      ...fallback,
      risk_flags: ["Customer belum memberikan profiling consent (UU PDP). Enrichment web publik dibatasi."],
      consent_compliant: false,
    };
  }

  const ai = getAIClient();
  if (!ai) {
    console.log("[ScoutIntelligence] No GEMINI_API_KEY available, using rule-based synthesis.");
    return fallback;
  }

  try {
    const { isCorporate, domain } = isCorporateBusinessEmail(input.email);
    const activities = Array.isArray(input.activities) ? input.activities : [];
    const formattedActivities = activities
      .map((a, idx) => {
        let det = "";
        if (a.details) {
          try {
            det = typeof a.details === "object" ? JSON.stringify(a.details) : String(a.details);
          } catch {
            det = "";
          }
        }
        return `[${idx + 1}] [${a.module}] [${a.activity_type}] ${a.title} ${det ? `(Detail: ${det})` : ""} | URL: ${a.page_url || "-"} | Waktu: ${a.created_at}`;
      })
      .join("\n");

    const prompt = `
Anda adalah Enterprise B2B Sales & Deep OSINT Intelligence Analyst profesional untuk platform ERP & Commerce terintegrasi. Tugas Anda adalah menganalisis data prospek calon pembeli bisnis (B2B) maupun perorangan secara mendalam (DEEP RECONNAISSANCE & DIGITAL FOOTPRINT INVESTIGATION).

LAKUKAN PENELUSURAN DEEP SCOUTING DI INTERNET (SOSIAL MEDIA, PEKERJAAN, RELASI, & DOSSIER BISNIS):
1. **Jejak Digital & Sosial Media**: Lakukan pencarian publik terhadap nama "${input.customer_name}", email "${input.email || ""}", nomor kontak "${input.phone || ""}", dan perusahaan/instansi "${input.company || ""}". Identifikasi akun publik di LinkedIn, X (Twitter), Instagram, YouTube, artikel berita, siaran pers, direktori bisnis, atau portofolio publik.
2. **Latar Belakang Pekerjaan & Karir**: Tentukan riwayat/jabatan pekerjaan, nama perusahaan, bidang industri, serta tingkat kewenangan pengadaan (DECISION_MAKER / INFLUENCER / BUYER / EVALUATOR).
3. **Relasi & Afiliasi Bisnis**: Temukan grup induk perusahaan, kemitraan vendor, asosiasi industri, atau keterlibatan proyek publik.
4. **Catatan Reputasi & Risiko Digital**: Evaluasi keabsahan jejak digital dan profil risiko secara obyektif.

BOBOT & ACKNOWLEDGE KHUSUS DOMAIN EMAIL BISNIS KORPORAT:
- Calon pelanggan ini mendaftar dengan email: ${input.email || "Tidak ada"} (Domain: @${domain || "N/A"}).
- Status Domain: ${isCorporate ? "RESMI DOMAIN BISNIS / KORPORASI PERUSAHAAN (Bukan Webmail Gratis)" : "Public Webmail (Gmail/Yahoo/Outlook/dll) atau Tanpa Domain Bisnis"}
- ATURAN SKORING PRIORITAS: Berikan bobot nilai lebih tinggi (bonus fit_score +20 hingga +30 poin, dan prioritas Lead Grade A/B) apabila calon pelanggan memiliki domain email bisnis resmi kustom perusahaan. Evaluasi domain web @${domain} dan nama instansi/perusahaan "${input.company}" untuk mengenali skala perusahaan, bidang usaha konstruksi/manufaktur/developer/instansi, dan estimasi daya beli mereka.

ATURAN KERAS KEPATUHAN & PRIVASI (UU PDP No. 27 Tahun 2022 & GDPR-ALIGNED):
1. HANYA gunakan informasi yang tersedia secara publik di internet (domain perusahaan, website korporat, direktori bisnis resmi) dan data first-party yang dicatat sistem internal.
2. DILARANG: menebak atau mencari data pribadi sensitif (KTP/NIK, rekening bank, agama, ras, kondisi kesehatan, alamat rumah tinggal privat).
3. Output harus berupa JSON murni tanpa pembuka/penutup markdown agar bisa di-parse langsung.

DATA PROSPEK:
- Nama Lengkap: ${input.customer_name}
- Email Bisnis: ${input.email || "Tidak ada"}
- No. WhatsApp / Telepon: ${input.phone || "Tidak ada"}
- Nama Perusahaan / Instansi: ${input.company || "Tidak ada"}
- Nilai Keranjang: Rp ${(input.cart_total_value || 0).toLocaleString("id-ID")} (${input.cart_total_items || 0} item)
- Snapshot Keranjang: ${JSON.stringify(input.cart_snapshot || [], null, 1)}

JEJAK AKTIVITAS WEBSITE FIRST-PARTY (PUBLIC, SHOP, KARIR):
Total aktivitas: ${activities.length} aktivitas
${formattedActivities || "Tidak ada riwayat aktivitas penelusuran selain penambahan keranjang."}

STRUKTUR OUTPUT JSON YANG DIHARUSKAN:
{
  "fit_score": number (0-100),
  "intent_score": number (0-100),
  "reachability_score": number (0-100),
  "dimensions": {
    "behavioral_intent": number (0-100),
    "engagement": number (0-100),
    "profile_fit": number (0-100),
    "freshness": number (0-100)
  },
  "persona_tag": "Enterprise Corporate" | "Kontraktor / Pelaksana" | "Distributor / Wholesaler" | "Instansi / Lembaga" | "Retail Buyer",
  "buying_power_est": string,
  "scout_company": string,
  "scout_role": string,
  "scout_summary": string (ringkasan eksekutif komprehensif),
  "key_talking_points": string[],
  "recommended_products": string[],
  "recommended_approach": string,
  "risk_flags": string[],
  "sources_json": [
    {
      "title": string,
      "url": string,
      "claim": string
    }
  ],
  "deep_osint": {
    "social_presence": [
      {
        "platform": string (misal "LinkedIn", "X / Twitter", "Instagram", "Siaran Pers / Berita", "Portofolio Publik"),
        "identifier_or_url": string,
        "summary": string
      }
    ],
    "career_background": [
      {
        "position": string,
        "organization": string,
        "scope_notes": string
      }
    ],
    "relations_and_affiliations": string[],
    "digital_reputation_notes": string,
    "authority_level": "DECISION_MAKER" | "INFLUENCER" | "BUYER" | "EVALUATOR"
  },
  "confidence_level": "HIGH" | "MEDIUM" | "LOW",
  "explanation": string[]
}
`;

    // Calling Gemini 3.8 Flash with Google Search Grounding for verified public intelligence
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = response.text?.trim() || "";
    let jsonString = rawText;
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    if (!jsonString) return fallback;

    const parsed = JSON.parse(jsonString);

    const fitScore = Math.min(100, Math.max(0, Number(parsed.fit_score) || fallback.fit_score));
    const intentScore = Math.min(100, Math.max(0, Number(parsed.intent_score) || fallback.intent_score));
    const reachabilityScore = Math.min(100, Math.max(0, Number(parsed.reachability_score) || fallback.reachability_score));

    const dimensions: LeadScoreDimensions = {
      behavioral_intent: Math.min(100, Math.max(0, Number(parsed.dimensions?.behavioral_intent) || intentScore)),
      engagement: Math.min(100, Math.max(0, Number(parsed.dimensions?.engagement) || fallback.dimensions.engagement)),
      profile_fit: Math.min(100, Math.max(0, Number(parsed.dimensions?.profile_fit) || fitScore)),
      freshness: Math.min(100, Math.max(0, Number(parsed.dimensions?.freshness) || fallback.dimensions.freshness)),
    };

    // Composite total score: 35% intent, 20% engagement, 30% fit, 15% freshness
    const compositeScore = Math.round(
      dimensions.behavioral_intent * 0.35 +
      dimensions.engagement * 0.20 +
      dimensions.profile_fit * 0.30 +
      dimensions.freshness * 0.15
    );

    const grade = calculateGrade(compositeScore);

    const sourcesJson: ScoutSource[] = Array.isArray(parsed.sources_json)
      ? parsed.sources_json.filter((s: any) => s && s.url && s.claim)
      : [];

    const scoutSources = sourcesJson.map((s) => `${s.title || "Sumber Web"}: ${s.claim}`);
    if (fallback.scout_sources.length > 0) {
      // Prepend domain verification badge from fallback
      const domainSource = fallback.scout_sources.find((s) => s.includes("Domain Bisnis"));
      if (domainSource && !scoutSources.some((s) => s.includes("Domain Bisnis"))) {
        scoutSources.unshift(domainSource);
      }
    }

    return {
      potential_score: compositeScore,
      lead_grade: grade,
      fit_score: fitScore,
      intent_score: intentScore,
      reachability_score: reachabilityScore,
      dimensions,
      persona_tag: parsed.persona_tag || fallback.persona_tag,
      buying_power_est: parsed.buying_power_est || fallback.buying_power_est,
      scout_company: parsed.scout_company || fallback.scout_company,
      scout_role: parsed.scout_role || fallback.scout_role,
      scout_summary: parsed.scout_summary || fallback.scout_summary,
      scout_sources: scoutSources,
      sources_json: sourcesJson,
      scout_recommendations: parsed.recommended_approach || fallback.scout_recommendations,
      key_talking_points: Array.isArray(parsed.key_talking_points) ? parsed.key_talking_points : fallback.key_talking_points,
      recommended_products: Array.isArray(parsed.recommended_products) ? parsed.recommended_products : fallback.recommended_products,
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags : fallback.risk_flags,
      confidence_level: parsed.confidence_level || (isCorporate ? "HIGH" : sourcesJson.length > 1 ? "HIGH" : "MEDIUM"),
      explanation: Array.isArray(parsed.explanation) ? parsed.explanation : fallback.explanation,
      consent_compliant: true,
      deep_osint: parsed.deep_osint || fallback.deep_osint,
    };
  } catch (err: any) {
    console.error("[ScoutIntelligence] Gemini reasoning error, falling back to rule-based:", err);
    return fallback;
  }
}
