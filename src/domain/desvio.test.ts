import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluarDesvio } from "./desvio.js";

describe("evaluarDesvio", () => {
  it("does not judge a price without enough history", () => {
    assert.equal(evaluarDesvio([100, 110], 500), null);
    assert.equal(evaluarDesvio([], 500), null);
  });

  it("accepts a price inside the usual range", () => {
    assert.equal(evaluarDesvio([100, 104, 98, 102, 101], 103), null);
  });

  it("flags a price far from the history, with the figures to show the surveyor", () => {
    const alerta = evaluarDesvio([100, 104, 98, 102, 101], 500);

    assert.ok(alerta);
    assert.equal(alerta.n, 5);
    assert.ok(Math.abs(alerta.media - 101) < 1e-9);
    assert.ok(alerta.desvio > 0);
    assert.ok(alerta.limiteSuperior < 500);
    assert.ok(alerta.limiteInferior > 0 && alerta.limiteInferior < 101);
  });

  it("flags a drop as well as a rise", () => {
    assert.ok(evaluarDesvio([100, 104, 98, 102, 101], 10));
  });

  it("never flags a change below the minimum relative tolerance, even if the history is flat", () => {
    // Flat history: the standard deviation is 0, so any change would otherwise be an outlier.
    assert.equal(evaluarDesvio([100, 100, 100, 100], 105), null);
    assert.ok(evaluarDesvio([100, 100, 100, 100], 130));
  });

  it("uses the 3 standard deviations limit when it is wider than the minimum tolerance", () => {
    const history = [100, 140, 60, 120, 80]; // sd ~ 31.6, 3sd ~ 95
    assert.equal(evaluarDesvio(history, 190), null);
    assert.ok(evaluarDesvio(history, 210));
  });

  it("allows the thresholds to be tuned", () => {
    const history = [100, 104, 98, 102, 101];
    assert.equal(evaluarDesvio(history, 120, { desviosEstandar: 100, toleranciaMinima: 0.5 }), null);
    assert.ok(evaluarDesvio(history, 120, { desviosEstandar: 1, toleranciaMinima: 0.01 }));
  });
});
