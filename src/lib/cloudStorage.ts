import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase.ts";

/**
 * Converts a File or Blob to a standard Base64 Data URL
 */
function blobToDataUrl(blob: Blob | File): Promise<string> {

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca file gambar sebagai Data URL"));
    reader.readAsDataURL(blob);
  });
}

function getUploadAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const headers: Record<string, string> = {};
  try {
    const token = localStorage.getItem("erp_token");
    if (token && token !== "null" && token !== "undefined") {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const rawUser = localStorage.getItem("erp_user");
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed?.username) {
        headers["x-user-email"] = parsed.username;
      }
    }
  } catch {}
  return headers;
}

/**
 * Uploads a file/blob to the server's durable SQLite + Cloud SSOT storage endpoint.
 */
async function uploadFileToServer(
  file: File | Blob,
  pathPrefix: string = "uploads"
): Promise<{ url: string; filename: string }> {

  const formData = new FormData();
  const fileName = (file instanceof File ? file.name : "image.webp").replace(/[^a-zA-Z0-9._-]/g, "_");
  formData.append("file", file, fileName);
  formData.append("prefix", pathPrefix);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      credentials: "same-origin",
      headers: getUploadAuthHeaders(),
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with status ${res.status}`);
    }

    const data = await res.json();
    return {
      url: data.url || data.fileUrl,
      filename: data.filename || fileName,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("[Upload] Server API upload failed, attempting fallback:", err?.message);
    throw err;
  }
}

/**
 * Uploads a file/blob to Firebase Cloud Storage bucket with a strict timeout failsafe.
 * Returns the public / download URL and the storage path.
 */
async function uploadFileToCloudStorage(
  file: File | Blob,
  pathPrefix: string = "uploads",
  timeoutMs: number = 4000
): Promise<{ url: string; path: string }> {

  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const fileName = (file instanceof File ? file.name : "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
  const fullPath = `${pathPrefix}/${timestamp}-${random}-${fileName}`;

  // Strict timeout promise to prevent SDK hanging indefinitely
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Cloud Storage upload timed out after " + timeoutMs + "ms"));
    }, timeoutMs);
  });

  const uploadPromise = (async () => {
    const storageRef = ref(storage, fullPath);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return { url: downloadUrl, path: fullPath };
  })();

  return Promise.race([uploadPromise, timeoutPromise]);
}

/**
 * Universal file uploader helper:
 * 1. Tries high-speed server multipart storage -> SQLite + Cloud SSOT (/api/media/:id).
 * 2. Tries Base64 JSON API upload -> SQLite + Cloud SSOT (/api/media/:id).
 * 3. Attempts Firebase Cloud Storage with strict 3.5s timeout.
 * 4. Failsafe inline Base64 Data URL so UI/DB never drops the image.
 */
export async function uploadUniversalFile(
  file: File | Blob,
  pathPrefix: string = "uploads"
): Promise<string> {
  // Tier 1: Server Multipart Upload -> persisted in SQLite WAL + Cloud SSOT (/api/media/:id)
  try {
    const res = await uploadFileToServer(file, pathPrefix);
    if (res.url) {
      return res.url;
    }
  } catch (serverErr) {
    console.warn("[UniversalUploader] Primary multipart upload failed:", serverErr);
  }

  // Tier 2: Base64 JSON API Upload -> persisted in SQLite WAL + Cloud SSOT (/api/media/:id)
  let cachedDataUrl: string | null = null;
  try {
    cachedDataUrl = await blobToDataUrl(file);
    const res = await fetch("/api/upload/base64", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...getUploadAuthHeaders(),
      },
      body: JSON.stringify({
        dataUrl: cachedDataUrl,
        filename: file instanceof File ? file.name : "upload.webp",
        prefix: pathPrefix,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch (b64Err) {
    console.warn("[UniversalUploader] Base64 server upload failed:", b64Err);
  }

  // Tier 3: Firebase Cloud Storage with strict 3.5s timeout
  try {
    const cloudRes = await uploadFileToCloudStorage(file, pathPrefix, 3500);
    if (cloudRes.url) {
      return cloudRes.url;
    }
  } catch (cloudErr) {
    console.warn("[UniversalUploader] Cloud storage fallback failed/timed out:", cloudErr);
  }

  // Tier 4: Final failsafe inline Data URL so database update never loses image
  return cachedDataUrl || (await blobToDataUrl(file));
}
