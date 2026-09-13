import { DocumentType } from "./types";

export function getFileType(fileName: string): DocumentType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jocky")) return "jocky";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  return "text";
}

export function encodeFile(buffer: ArrayBuffer) {
  let output = "";
  for (const byte of new Uint8Array(buffer)) output += String.fromCharCode(byte);
  return window.btoa(output);
}

export function isDesktop() {
  return Boolean(window.evidraDesktop);
}
