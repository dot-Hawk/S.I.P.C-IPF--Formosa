import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { preciosCsv, variedadesTabla } from "./calculo-export.js";

describe("preciosCsv", () => {
  it("writes the header and one line per observation in the engine's column order", () => {
    const csv = preciosCsv([
      { variedad: "1111101", informante: "c-1", tipo: "TRAD", mes: "2026-01", precio: 100.5 },
      { variedad: "1111102", informante: "c-2", tipo: "SUPER", mes: "2026-02", precio: 80 },
    ]);

    assert.equal(
      csv,
      "VARIEDAD,INFORMANTE,TIPO,MES,PRECIO\r\n1111101,c-1,TRAD,2026-01,100.5\r\n1111102,c-2,SUPER,2026-02,80\r\n",
    );
  });

  it("quotes values that contain separators, quotes or line breaks", () => {
    const csv = preciosCsv([{ variedad: "1", informante: 'Kiosco "El, Sol"', tipo: "TRAD", mes: "2026-01", precio: 1 }]);

    assert.equal(csv.split("\r\n")[1], '1,"Kiosco ""El, Sol""",TRAD,2026-01,1');
  });

  it("is only the header when there are no observations", () => {
    assert.equal(preciosCsv([]), "VARIEDAD,INFORMANTE,TIPO,MES,PRECIO\r\n");
  });
});

describe("variedadesTabla", () => {
  it("pads the groups to the longest chain and flags the special treatment as SI/NO", () => {
    const tabla = variedadesTabla([
      { codigo: "1111101", grupos: ["A0111111", "A01111", "A0111"], tratamientoEspecial: false },
      { codigo: "1111102", grupos: ["C:11111"], tratamientoEspecial: true },
    ]);

    assert.deepEqual(tabla, [
      ["VARIEDAD", "GRUPO_1", "GRUPO_2", "GRUPO_3", "TRATAMIENTO_ESPECIAL"],
      ["1111101", "A0111111", "A01111", "A0111", "NO"],
      ["1111102", "C:11111", "", "", "SI"],
    ]);
  });

  it("has only the fixed columns when no variedad has groups", () => {
    assert.deepEqual(variedadesTabla([{ codigo: "1", grupos: [], tratamientoEspecial: false }]), [
      ["VARIEDAD", "TRATAMIENTO_ESPECIAL"],
      ["1", "NO"],
    ]);
  });
});
