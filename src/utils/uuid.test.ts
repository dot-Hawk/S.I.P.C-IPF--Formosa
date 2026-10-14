import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUuid } from "./uuid.js";

describe("isUuid", () => {
  it("accepts canonical uuids in any case", () => {
    assert.equal(isUuid("3f2c8a52-7d1e-4b9a-9c43-0a1b2c3d4e5f"), true);
    assert.equal(isUuid("3F2C8A52-7D1E-4B9A-9C43-0A1B2C3D4E5F"), true);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "abc", "507f1f77bcf86cd799439011", "3f2c8a52-7d1e-4b9a-9c43-0a1b2c3d4e5", undefined, null, 12, {}]) {
      assert.equal(isUuid(bad), false);
    }
  });
});
