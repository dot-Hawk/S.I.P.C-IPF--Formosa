import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalDiskStorage } from "./attachment-storage.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "sipc-storage-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const KEY = "0f8e7d6c-1111-4222-8333-444455556666.jpg";

describe("local disk storage", () => {
  it("stores and reads back the same bytes", async () => {
    const storage = createLocalDiskStorage(path.join(dir, "nested"));

    await storage.put(KEY, Buffer.from("ticket"));

    assert.equal((await storage.get(KEY))?.toString(), "ticket");
  });

  it("answers null for a missing key and tolerates removing it twice", async () => {
    const storage = createLocalDiskStorage(dir);

    assert.equal(await storage.get(KEY), null);
    await storage.put(KEY, Buffer.from("x"));
    await storage.remove(KEY);
    await storage.remove(KEY);

    assert.equal(await storage.get(KEY), null);
    assert.deepEqual(await readdir(dir), []);
  });

  it("refuses keys that could escape the directory", async () => {
    const storage = createLocalDiskStorage(dir);

    for (const key of ["../evil.jpg", "a/b.jpg", "..", "", "x\0.jpg"]) {
      await assert.rejects(() => storage.put(key, Buffer.from("x")), /Invalid storage key/);
      await assert.rejects(() => storage.get(key), /Invalid storage key/);
    }
  });
});
