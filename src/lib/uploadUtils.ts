import {
  isTextContentType,
  normalizeTextContentType,
  TEXT_FILE_EXTENSION_SET,
} from "clawhub-schema/textFiles";
import { getUserFacingConvexError } from "./convexError";

export async function uploadFile(uploadUrl: string, file: File) {
  const path = file.webkitRelativePath || file.name;
  const contentType =
    normalizeTextContentType(path, file.type) || file.type || "application/octet-stream";
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${await response.text()}`);
  }
  const payload = (await response.json()) as { storageId: string };
  return payload.storageId;
}

export async function hashFile(file: File) {
  const buffer =
    typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();
  const input = new Uint8Array(buffer);
  // crypto.subtle 在 HTTP 非 secure context（如内网 http://ip 部署）下是 undefined，
  // 此时降级到纯 JS 实现，避免发布表单卡在"正在上传文件…"。
  const bytes = await sha256Bytes(input);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    const hash = await subtle.digest("SHA-256", input);
    return new Uint8Array(hash);
  }
  const { sha256 } = await import("@noble/hashes/sha2.js");
  return sha256(input);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function formatPublishError(error: unknown) {
  return getUserFacingConvexError(error, "Publish failed. Please try again.");
}

export function isTextFile(file: File) {
  const path = (file.webkitRelativePath || file.name).trim().toLowerCase();
  if (!path) return false;
  const parts = path.split(".");
  const extension = parts.length > 1 ? (parts.at(-1) ?? "") : "";
  if (file.type && isTextContentType(file.type)) return true;
  if (extension && TEXT_FILE_EXTENSION_SET.has(extension)) return true;
  return false;
}

export async function readText(blob: Blob) {
  if (typeof (blob as Blob & { text?: unknown }).text === "function") {
    return (blob as Blob & { text: () => Promise<string> }).text();
  }
  if (typeof (blob as Blob & { arrayBuffer?: unknown }).arrayBuffer === "function") {
    const buffer = await (blob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(buffer));
  }
  if (typeof FileReader !== "undefined" && blob instanceof Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("error", () => {
        reject(reader.error ?? new Error("Could not read blob."));
      });
      reader.addEventListener("load", () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
      });
      reader.readAsText(blob);
    });
  }
  return new Response(blob as BodyInit).text();
}
