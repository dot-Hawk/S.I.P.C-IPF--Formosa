import { type ValidationError, type ValidationResult } from "./validation.js";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const VARIEDAD = /^\d{7}$/;
const MAX_MESES = 36;
const MAX_ESPERAR_MESES = 12;

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function mesIndex(mes: string): number {
  return Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7));
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function validateCalculoCreate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { mesBase, mesObjetivo, excluirOfertas, parametros } = input;

  const baseOk = typeof mesBase === "string" && MES.test(mesBase);
  const objetivoOk = typeof mesObjetivo === "string" && MES.test(mesObjetivo);

  if (!baseOk) errors.push({ field: "mesBase", message: "mesBase must be AAAA-MM" });
  if (!objetivoOk) errors.push({ field: "mesObjetivo", message: "mesObjetivo must be AAAA-MM" });

  if (baseOk && objetivoOk) {
    const meses = mesIndex(mesObjetivo) - mesIndex(mesBase) + 1;
    if (meses < 1) {
      errors.push({ field: "mesObjetivo", message: "mesObjetivo cannot be before mesBase" });
    } else if (meses > MAX_MESES) {
      errors.push({ field: "mesObjetivo", message: `the range cannot exceed ${MAX_MESES} months` });
    }
  }

  if (excluirOfertas !== undefined && typeof excluirOfertas !== "boolean") {
    errors.push({ field: "excluirOfertas", message: "excluirOfertas must be a boolean" });
  }

  if (parametros !== undefined) {
    if (typeof parametros !== "object" || parametros === null || Array.isArray(parametros)) {
      errors.push({ field: "parametros", message: "parametros must be an object" });
    } else {
      const p = parametros as Record<string, unknown>;
      if (
        p["esperarMeses"] !== undefined &&
        !(Number.isInteger(p["esperarMeses"]) && (p["esperarMeses"] as number) >= 0 && (p["esperarMeses"] as number) <= MAX_ESPERAR_MESES)
      ) {
        errors.push({
          field: "parametros.esperarMeses",
          message: `esperarMeses must be an integer between 0 and ${MAX_ESPERAR_MESES}`,
        });
      }
      for (const field of ["pesoSuper", "pesoTrad"] as const) {
        if (p[field] !== undefined && !isNonNegativeNumber(p[field])) {
          errors.push({ field: `parametros.${field}`, message: `${field} must be a number greater than or equal to 0` });
        }
      }
      if (p["omitirGruposCompletos"] !== undefined && typeof p["omitirGruposCompletos"] !== "boolean") {
        errors.push({ field: "parametros.omitirGruposCompletos", message: "omitirGruposCompletos must be a boolean" });
      }
    }
  }

  return result(errors);
}

export function validateRelativosFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { variedad, mes } = query;

  if (variedad !== undefined && !(typeof variedad === "string" && VARIEDAD.test(variedad))) {
    errors.push({ field: "variedad", message: "variedad must be a 7 digit codigo" });
  }
  if (mes !== undefined && !(typeof mes === "string" && MES.test(mes))) {
    errors.push({ field: "mes", message: "mes must be AAAA-MM" });
  }

  return result(errors);
}
