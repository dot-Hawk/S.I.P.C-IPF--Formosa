import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { signToken, verifyToken } from "./token.service.js";

const SECRET = "test-secret";

describe("token service", () => {
  it("round-trips userId and role", () => {
    const token = signToken({ userId: "u1", role: "COORDINADOR" }, SECRET, "1h");

    assert.deepEqual(verifyToken(token, SECRET), { userId: "u1", role: "COORDINADOR" });
  });

  it("rejects a token signed with another secret", () => {
    const token = signToken({ userId: "u1", role: "ANALISTA" }, "other-secret", "1h");

    assert.equal(verifyToken(token, SECRET), null);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ userId: "u1", role: "ANALISTA" }, SECRET, { expiresIn: -10 });

    assert.equal(verifyToken(token, SECRET), null);
  });

  it("rejects garbage", () => {
    assert.equal(verifyToken("not.a.token", SECRET), null);
  });

  it("rejects a token carrying an unknown role", () => {
    const token = jwt.sign({ userId: "u1", role: "ROOT" }, SECRET, { expiresIn: "1h" });

    assert.equal(verifyToken(token, SECRET), null);
  });

  it("rejects an unsigned (alg none) token", () => {
    const token = jwt.sign({ userId: "u1", role: "DIRECCION" }, "", { algorithm: "none" });

    assert.equal(verifyToken(token, SECRET), null);
  });
});
