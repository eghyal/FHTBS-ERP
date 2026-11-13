import crypto from "crypto";

export interface WotQrPayload {
  v: number;              // Version (1)
  wot_id: string;         // UUID of WOT
  id?: string;            // Alias for wot_id
  lot: string;            // Human readable lot number
  wot_number?: string;    // Alias for lot
  prj: string;            // Project code/number
  project_id?: string;    // Alias for prj
  st: string;             // Station code/name
  station_id?: string;    // Alias for st
  proc: string;           // Process name / BOP id
  bop_id?: string;        // Alias for proc
  mch: string;            // Machine code/name
  machine_id?: string;    // Alias for mch
  qty: number;            // Batch quantity
  ts: string;             // Timestamp ISO
  sig?: string;           // HMAC-SHA256 signature
}

const QR_SECRET_KEY = process.env.QR_SECRET_KEY || "FHTBS_ERP_SECURE_QR_KEY_2026_PRODUCTION";
const ENCRYPTION_KEY = crypto.createHash("sha256").update(QR_SECRET_KEY).digest(); // 32 bytes for AES-256
const IV_LENGTH = 16; // 16 bytes for AES-CBC

/**
 * Generate HMAC-SHA256 signature for WOT payload
 */
export function signWotPayload(payloadWithoutSig: Omit<WotQrPayload, "sig">): string {
  const canonicalString = [
    payloadWithoutSig.v,
    payloadWithoutSig.wot_id,
    payloadWithoutSig.lot,
    payloadWithoutSig.prj,
    payloadWithoutSig.st,
    payloadWithoutSig.proc,
    payloadWithoutSig.mch,
    payloadWithoutSig.qty,
    payloadWithoutSig.ts
  ].join("|");

  return crypto.createHmac("sha256", QR_SECRET_KEY).update(canonicalString).digest("hex");
}

/**
 * Encrypt arbitrary string using AES-256-CBC
 */
export function encryptQrPayload(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt string using AES-256-CBC
 */
export function decryptQrPayload(cipherText: string): string | null {
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return null;
  }
}

export interface WotQrInputData {
  wot_id?: string;
  id?: string;
  lot?: string;
  wot_number?: string;
  prj?: string;
  project_id?: string;
  st?: string;
  station_id?: string;
  proc?: string;
  bop_id?: string;
  mch?: string;
  machine_id?: string;
  qty: number;
  ts?: string;
}

/**
 * Generate complete signed WOT QR Payload
 */
export function generateSignedWotQr(data: WotQrInputData): {
  payloadObj: WotQrPayload;
  rawJson: string;
  encryptedQrText: string;
  qrString: string;
  signature: string;
  qrDataUrl: string;
} {
  const resolvedWotId = data.wot_id || data.id || "";
  const resolvedLot = data.lot || data.wot_number || "";
  const resolvedPrj = data.prj || data.project_id || "";
  const resolvedSt = data.st || data.station_id || "ST-01";
  const resolvedProc = data.proc || data.bop_id || "General";
  const resolvedMch = data.mch || data.machine_id || "MANUAL";
  const resolvedQty = Number(data.qty) || 1;
  const resolvedTs = data.ts || new Date().toISOString();

  const payloadWithoutSig: Omit<WotQrPayload, "sig"> = {
    v: 1,
    wot_id: resolvedWotId,
    id: resolvedWotId,
    lot: resolvedLot,
    wot_number: resolvedLot,
    prj: resolvedPrj,
    project_id: resolvedPrj,
    st: resolvedSt,
    station_id: resolvedSt,
    proc: resolvedProc,
    bop_id: resolvedProc,
    mch: resolvedMch,
    machine_id: resolvedMch,
    qty: resolvedQty,
    ts: resolvedTs
  };

  const sig = signWotPayload(payloadWithoutSig);
  const payloadObj: WotQrPayload = { ...payloadWithoutSig, sig };
  const rawJson = JSON.stringify(payloadObj);
  const encryptedQrText = encryptQrPayload(rawJson);

  return {
    payloadObj,
    rawJson,
    encryptedQrText,
    qrString: encryptedQrText,
    signature: sig,
    qrDataUrl: encryptedQrText,
  };
}

function hydratePayloadAliases(parsed: WotQrPayload): WotQrPayload {
  const wotId = parsed.wot_id || parsed.id || "";
  const lot = parsed.lot || parsed.wot_number || "";
  const prj = parsed.prj || parsed.project_id || "";
  const st = parsed.st || parsed.station_id || "";
  const proc = parsed.proc || parsed.bop_id || "";
  const mch = parsed.mch || parsed.machine_id || "";
  return {
    ...parsed,
    wot_id: wotId,
    id: wotId,
    lot,
    wot_number: lot,
    prj,
    project_id: prj,
    st,
    station_id: st,
    proc,
    bop_id: proc,
    mch,
    machine_id: mch,
  };
}

/**
 * Verify and parse WOT QR Payload from camera scanner or input string
 */
export function verifyAndParseWotQr(rawInput: string): {
  isValid: boolean;
  valid: boolean;
  payload?: WotQrPayload;
  reason?: string;
  isFallbackLot?: boolean;
} {
  if (!rawInput || typeof rawInput !== "string") {
    return { isValid: false, valid: false, reason: "EMPTY_PAYLOAD" };
  }

  const trimmed = rawInput.trim();

  // Case 1: Encrypted with AES-256-CBC (iv:ciphertext)
  let jsonString = trimmed;
  if (trimmed.includes(":") && !trimmed.startsWith("{")) {
    const decrypted = decryptQrPayload(trimmed);
    if (decrypted) {
      jsonString = decrypted;
    }
  }

  // Case 2: Base64-encoded JSON string
  if (!jsonString.startsWith("{")) {
    try {
      const decoded = Buffer.from(jsonString, "base64").toString("utf8");
      if (decoded.startsWith("{")) {
        jsonString = decoded;
      }
    } catch (_) {}
  }

  // Case 3: Parse JSON
  if (jsonString.startsWith("{")) {
    try {
      const rawParsed: WotQrPayload = JSON.parse(jsonString);
      const parsed = hydratePayloadAliases(rawParsed);

      if (!parsed.wot_id && !parsed.lot) {
        return { isValid: false, valid: false, reason: "MALFORMED_PAYLOAD" };
      }

      // Check HMAC signature if present
      if (parsed.sig) {
        const expectedSig = signWotPayload({
          v: parsed.v || 1,
          wot_id: parsed.wot_id,
          lot: parsed.lot,
          prj: parsed.prj,
          st: parsed.st,
          proc: parsed.proc,
          mch: parsed.mch,
          qty: parsed.qty,
          ts: parsed.ts
        });

        if (parsed.sig !== expectedSig) {
          return {
            isValid: false,
            valid: false,
            reason: "INVALID_SIGNATURE",
            payload: parsed
          };
        }

        return { isValid: true, valid: true, payload: parsed };
      } else {
        // Unsigned JSON payload
        return {
          isValid: false,
          valid: false,
          reason: "UNSIGNED_PAYLOAD",
          payload: parsed
        };
      }
    } catch (e: any) {
      return { isValid: false, valid: false, reason: "JSON_PARSE_ERROR" };
    }
  }

  // Case 4: Plain manual lot number entry (e.g. WOT-LOT-001)
  // Permitted as manual operator fallback on kiosk terminal
  return {
    isValid: true,
    valid: true,
    isFallbackLot: true,
    payload: hydratePayloadAliases({
      v: 1,
      wot_id: "",
      lot: trimmed,
      prj: "",
      st: "",
      proc: "",
      mch: "",
      qty: 0,
      ts: new Date().toISOString()
    })
  };
}
