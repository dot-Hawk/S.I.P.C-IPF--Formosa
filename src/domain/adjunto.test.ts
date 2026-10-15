import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectTipoAdjunto, MAX_ADJUNTO_BYTES, TIPOS_ADJUNTO } from "./adjunto.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.from("%PDF-1.7\n", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]);

describe("detectTipoAdjunto", () => {
  it("recognizes jpeg, png, webp and pdf by their content", () => {
    assert.deepEqual(detectTipoAdjunto(JPEG), { mime: "image/jpeg", extension: "jpg" });
    assert.deepEqual(detectTipoAdjunto(PNG), { mime: "image/png", extension: "png" });
    assert.deepEqual(detectTipoAdjunto(WEBP), { mime: "image/webp", extension: "webp" });
    assert.deepEqual(detectTipoAdjunto(PDF), { mime: "application/pdf", extension: "pdf" });
  });

  it("rejects anything else, including a RIFF container that is not webp", () => {
    assert.equal(detectTipoAdjunto(Buffer.from("<html></html>")), null);
    assert.equal(detectTipoAdjunto(Buffer.from("MZ\x90\x00")), null);
    assert.equal(detectTipoAdjunto(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WAVEfmt ")])), null);
    assert.equal(detectTipoAdjunto(Buffer.alloc(0)), null);
  });

  it("exposes the accepted mime types and the size limit", () => {
    assert.deepEqual([...TIPOS_ADJUNTO].sort(), ["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    assert.equal(MAX_ADJUNTO_BYTES, 5 * 1024 * 1024);
  });
});
