// Attachments are photos or scans of a receipt. The type is decided from the bytes, never from
// the name or the Content-Type the client declares.

export const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024;
export const MAX_ADJUNTOS_POR_PRECIO = 5;

export const TIPOS_ADJUNTO = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export interface TipoAdjunto {
  mime: (typeof TIPOS_ADJUNTO)[number];
  extension: string;
}

function startsWith(data: Buffer, bytes: number[], offset = 0): boolean {
  return data.length >= offset + bytes.length && bytes.every((byte, i) => data[offset + i] === byte);
}

function ascii(text: string): number[] {
  return [...Buffer.from(text, "latin1")];
}

export function detectTipoAdjunto(data: Buffer): TipoAdjunto | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: "jpg" };
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extension: "png" };
  if (startsWith(data, ascii("%PDF-"))) return { mime: "application/pdf", extension: "pdf" };
  // RIFF is a generic container (WAV, AVI...): the form type at offset 8 is what says it is WebP.
  if (startsWith(data, ascii("RIFF")) && startsWith(data, ascii("WEBP"), 8)) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}
