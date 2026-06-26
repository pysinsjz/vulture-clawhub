import {
  isTextContentType,
  normalizeTextContentType,
  TEXT_FILE_EXTENSION_SET,
} from "clawhub-schema/textFiles";
import { getUserFacingConvexError } from "../../lib/convexError";

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
  // 此时降级到纯 JS SHA-256，避免发布表单卡在"正在上传文件…"。
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  let bytes: Uint8Array;
  if (subtle) {
    bytes = new Uint8Array(await subtle.digest("SHA-256", input));
  } else {
    const { sha256 } = await import("@noble/hashes/sha2.js");
    bytes = sha256(input);
  }
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  return new Response(blob as BodyInit).text();
}
