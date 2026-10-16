// Closed value sets shared by the database schema, the validators and the business rules.

export const ROLES = ["ENCUESTADOR", "SUPERVISOR", "ANALISTA", "COORDINADOR", "DIRECCION"] as const;
export const ESTADOS_USUARIO = ["ACTIVO", "INACTIVO", "LICENCIA"] as const;

export const FRECUENCIAS_RELEVAMIENTO = ["QUINCENAL", "MENSUAL"] as const;
export const ESTADOS_RELEVAMIENTO = ["ABIERTO", "CERRADO"] as const;

export const TIPOS_COMERCIO = [
  "SUPERMERCADO",
  "ALMACEN",
  "VERDULERIA",
  "CARNICERIA",
  "FARMACIA",
  "OTRO",
] as const;
export const ESTADOS_COMERCIO = ["ACTIVO", "INACTIVO"] as const;

export const UNIDADES_PRODUCTO = ["KG", "G", "LT", "ML", "UNIDAD"] as const;
export const ESTADOS_PRODUCTO = ["ACTIVO", "INACTIVO"] as const;

export const ESTADOS_ASIGNACION = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"] as const;

// Level 0 is the whole basket and level 6 is the variedad, the lowest level that is priced.
export const NIVELES_CANASTA = [
  "NIVEL_GENERAL",
  "DIVISION",
  "GRUPO",
  "CLASE",
  "SUBCLASE",
  "PRODUCTO",
  "VARIEDAD",
] as const;
export const NIVEL_VARIEDAD = 6;
// Not hierarchical: every variedad belongs to exactly one of these.
export const CATEGORIAS_CANASTA = ["NUCLEO", "ESTACIONAL", "REGULADO"] as const;
export const ESTADOS_CANASTA = ["ACTIVO", "INACTIVO"] as const;

export const ACCIONES_AUDITORIA = [
  "CREACION",
  "MODIFICACION",
  "ELIMINACION",
  "ADJUNTO_AGREGADO",
  "ADJUNTO_ELIMINADO",
] as const;

// A run is accepted as EJECUTANDO and ends COMPLETADO or FALLIDO: the engine call is asynchronous.
export const ESTADOS_CALCULO = ["EJECUTANDO", "COMPLETADO", "FALLIDO"] as const;

export type Role = (typeof ROLES)[number];
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];
export type FrecuenciaRelevamiento = (typeof FRECUENCIAS_RELEVAMIENTO)[number];
export type EstadoRelevamiento = (typeof ESTADOS_RELEVAMIENTO)[number];
export type TipoComercio = (typeof TIPOS_COMERCIO)[number];
export type EstadoComercio = (typeof ESTADOS_COMERCIO)[number];
export type UnidadProducto = (typeof UNIDADES_PRODUCTO)[number];
export type EstadoProducto = (typeof ESTADOS_PRODUCTO)[number];
export type EstadoAsignacion = (typeof ESTADOS_ASIGNACION)[number];
export type CategoriaCanasta = (typeof CATEGORIAS_CANASTA)[number];
export type EstadoCanasta = (typeof ESTADOS_CANASTA)[number];
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];
export type EstadoCalculo = (typeof ESTADOS_CALCULO)[number];
