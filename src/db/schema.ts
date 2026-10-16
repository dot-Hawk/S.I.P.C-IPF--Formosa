import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { type Alerta } from "../domain/desvio.js";
import {
  ACCIONES_AUDITORIA,
  CATEGORIAS_CANASTA,
  ESTADOS_ASIGNACION,
  ESTADOS_CALCULO,
  ESTADOS_CANASTA,
  ESTADOS_COMERCIO,
  ESTADOS_PRODUCTO,
  ESTADOS_RELEVAMIENTO,
  ESTADOS_USUARIO,
  FRECUENCIAS_RELEVAMIENTO,
  ROLES,
  TIPOS_COMERCIO,
  UNIDADES_PRODUCTO,
} from "../domain/enums.js";

export const rolEnum = pgEnum("rol", ROLES);
export const estadoUsuarioEnum = pgEnum("estado_usuario", ESTADOS_USUARIO);
export const frecuenciaEnum = pgEnum("frecuencia_relevamiento", FRECUENCIAS_RELEVAMIENTO);
export const estadoRelevamientoEnum = pgEnum("estado_relevamiento", ESTADOS_RELEVAMIENTO);
export const tipoComercioEnum = pgEnum("tipo_comercio", TIPOS_COMERCIO);
export const estadoComercioEnum = pgEnum("estado_comercio", ESTADOS_COMERCIO);
export const unidadEnum = pgEnum("unidad_producto", UNIDADES_PRODUCTO);
export const estadoProductoEnum = pgEnum("estado_producto", ESTADOS_PRODUCTO);
export const estadoAsignacionEnum = pgEnum("estado_asignacion", ESTADOS_ASIGNACION);
export const categoriaCanastaEnum = pgEnum("categoria_canasta", CATEGORIAS_CANASTA);
export const estadoCanastaEnum = pgEnum("estado_canasta", ESTADOS_CANASTA);
export const accionAuditoriaEnum = pgEnum("accion_auditoria", ACCIONES_AUDITORIA);
export const estadoCalculoEnum = pgEnum("estado_calculo", ESTADOS_CALCULO);

const id = () => uuid("id").primaryKey().defaultRandom();

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Prices and quantities are exact decimals in the database and plain numbers in the API.
const decimal = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });

export const users = pgTable("users", {
  id: id(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  dni: text("dni").notNull().unique(),
  legajo: text("legajo").notNull().unique(),
  // Stored lowercase and trimmed by the application.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: rolEnum("role").notNull(),
  estado: estadoUsuarioEnum("estado").notNull(),
  ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true, mode: "date" }),
  ...timestamps,
});

export const relevamientos = pgTable(
  "relevamientos",
  {
    id: id(),
    periodo: text("periodo").notNull(),
    frecuencia: frecuenciaEnum("frecuencia").notNull(),
    fechaInicio: timestamp("fecha_inicio", { withTimezone: true, mode: "date" }).notNull(),
    fechaLimite: timestamp("fecha_limite", { withTimezone: true, mode: "date" }).notNull(),
    estado: estadoRelevamientoEnum("estado").notNull(),
    ...timestamps,
  },
  (t) => [unique("relevamientos_periodo_frecuencia_uq").on(t.periodo, t.frecuencia)],
);

export const comercios = pgTable("comercios", {
  id: id(),
  nombre: text("nombre").notNull(),
  direccion: text("direccion").notNull(),
  zona: text("zona").notNull(),
  tipo: tipoComercioEnum("tipo").notNull(),
  estado: estadoComercioEnum("estado").notNull(),
  ...timestamps,
});

export const canastaNodos = pgTable(
  "canasta_nodos",
  {
    codigo: text("codigo").primaryKey(),
    nombre: text("nombre").notNull(),
    nivel: smallint("nivel").notNull(),
    padre: text("padre"),
    ponderador: doublePrecision("ponderador").notNull().default(0),
    // Rebuilt from its variedades because the official spreadsheets have no row for it.
    derivado: boolean("derivado").notNull().default(false),
    estado: estadoCanastaEnum("estado").notNull(),
    categoria: categoriaCanastaEnum("categoria"),
    codigoVariedad12: text("codigo_variedad_12"),
    tratamientoEspecial: boolean("tratamiento_especial"),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.padre], foreignColumns: [t.codigo], name: "canasta_nodos_padre_fk" }),
    check("canasta_nodos_nivel_ck", sql`${t.nivel} between 0 and 6`),
    check("canasta_nodos_ponderador_ck", sql`${t.ponderador} >= 0`),
    index("canasta_nodos_padre_idx").on(t.padre),
    index("canasta_nodos_nivel_estado_idx").on(t.nivel, t.estado),
  ],
);

export const productos = pgTable(
  "productos",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    categoria: text("categoria").notNull(),
    unidad: unidadEnum("unidad").notNull(),
    cantidadReferencia: decimal("cantidad_referencia").notNull(),
    marca: text("marca"),
    codigoVariedad: text("codigo_variedad")
      .notNull()
      .references(() => canastaNodos.codigo),
    estado: estadoProductoEnum("estado").notNull(),
    ...timestamps,
  },
  (t) => [
    check("productos_cantidad_ck", sql`${t.cantidadReferencia} > 0`),
    // A producto is identified by nombre + marca + unidad + cantidadReferencia, ignoring case.
    // A missing marca counts as one value.
    uniqueIndex("productos_identidad_uq").on(
      sql`lower(${t.nombre})`,
      sql`coalesce(lower(${t.marca}), '')`,
      t.unidad,
      t.cantidadReferencia,
    ),
    index("productos_codigo_variedad_idx").on(t.codigoVariedad),
  ],
);

export const asignaciones = pgTable(
  "asignaciones",
  {
    id: id(),
    relevamiento: uuid("relevamiento_id")
      .notNull()
      .references(() => relevamientos.id),
    encuestador: uuid("encuestador_id")
      .notNull()
      .references(() => users.id),
    comercio: uuid("comercio_id")
      .notNull()
      .references(() => comercios.id),
    estado: estadoAsignacionEnum("estado").notNull(),
    ...timestamps,
  },
  (t) => [
    // A cancelled asignacion frees its comercio, so only the live ones count. The predicate lists the
    // live estados instead of `<> 'CANCELADA'`: Postgres cannot use an enum value in the same
    // transaction that adds it, and the migration runner applies everything in one.
    uniqueIndex("asignaciones_relevamiento_comercio_uq")
      .on(t.relevamiento, t.comercio)
      .where(sql`${t.estado} in ('PENDIENTE', 'EN_CURSO', 'COMPLETADA')`),
    index("asignaciones_encuestador_idx").on(t.encuestador),
  ],
);

export const precios = pgTable(
  "precios",
  {
    id: id(),
    relevamiento: uuid("relevamiento_id")
      .notNull()
      .references(() => relevamientos.id),
    producto: uuid("producto_id")
      .notNull()
      .references(() => productos.id),
    comercio: uuid("comercio_id")
      .notNull()
      .references(() => comercios.id),
    encuestador: uuid("encuestador_id")
      .notNull()
      .references(() => users.id),
    valor: decimal("valor").notNull(),
    // Price taken from a promotion; kept as registered so results can be split with/without offers.
    oferta: boolean("oferta").notNull().default(false),
    fechaRelevamiento: timestamp("fecha_relevamiento", { withTimezone: true, mode: "date" }).notNull(),
    observacion: text("observacion"),
    // Set when the price was far from its history and the surveyor confirmed it anyway.
    alerta: jsonb("alerta").$type<Alerta>(),
    ...timestamps,
  },
  (t) => [
    check("precios_valor_ck", sql`${t.valor} > 0`),
    unique("precios_relevamiento_producto_comercio_uq").on(t.relevamiento, t.producto, t.comercio),
    index("precios_encuestador_idx").on(t.encuestador),
    index("precios_fecha_idx").on(t.fechaRelevamiento),
  ],
);

export interface PrecioSnapshot {
  valor: number;
  oferta: boolean;
  observacion: string | null;
  fechaRelevamiento: string;
}

export interface AdjuntoDetalle {
  adjunto: string;
  mime: string;
  bytes: number;
  sha256: string;
}

// Photo or scan of the receipt that supports a precio. The bytes live in the attachment storage;
// `clave` is the key to find them there.
export const precioAdjuntos = pgTable(
  "precio_adjuntos",
  {
    id: id(),
    precio: uuid("precio_id")
      .notNull()
      .references(() => precios.id, { onDelete: "cascade" }),
    clave: text("clave").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    subidoPor: uuid("subido_por_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("precio_adjuntos_precio_idx").on(t.precio)],
);

// Append-only record of what happened to a precio. It keeps the values, so it stays meaningful
// after the precio itself is deleted: the ids are plain columns on purpose.
export const precioAuditoria = pgTable(
  "precio_auditoria",
  {
    id: id(),
    precio: uuid("precio_id").notNull(),
    relevamiento: uuid("relevamiento_id").notNull(),
    comercio: uuid("comercio_id").notNull(),
    producto: uuid("producto_id").notNull(),
    accion: accionAuditoriaEnum("accion").notNull(),
    usuario: uuid("usuario_id")
      .notNull()
      .references(() => users.id),
    rol: text("rol").notNull(),
    anterior: jsonb("anterior").$type<PrecioSnapshot>(),
    posterior: jsonb("posterior").$type<PrecioSnapshot>(),
    // What an attachment event is about; the precio snapshots do not change in those.
    detalle: jsonb("detalle").$type<AdjuntoDetalle>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("precio_auditoria_precio_idx").on(t.precio),
    index("precio_auditoria_usuario_idx").on(t.usuario),
    index("precio_auditoria_created_idx").on(t.createdAt),
  ],
);

export interface ParametrosCalculo {
  esperarMeses: number;
  pesoSuper: number;
  pesoTrad: number;
  omitirGruposCompletos: boolean;
}

export interface ResumenCalculo {
  observaciones: number;
  variedades: number;
  informantes: number;
  imputaciones: number;
  sinImputar: number;
  // Prices no level could estimate (comercio ids), so a run that left gaps says where.
  sinImputarDetalle?: { variedad: string; comercio: string; mes: string }[];
}

// One execution of the calculation engine. Immutable: a new run is created whenever the inputs or
// the parameters change, so every published figure can be traced to its inputs.
export const calculos = pgTable(
  "calculos",
  {
    id: id(),
    mesBase: text("mes_base").notNull(),
    mesObjetivo: text("mes_objetivo").notNull(),
    excluirOfertas: boolean("excluir_ofertas").notNull().default(false),
    parametros: jsonb("parametros").$type<ParametrosCalculo>().notNull(),
    motorVersion: text("motor_version"),
    // Hash of everything sent to the engine, to tell whether two runs had the same inputs.
    entradaHash: text("entrada_hash").notNull(),
    estado: estadoCalculoEnum("estado").notNull(),
    error: text("error"),
    resumen: jsonb("resumen").$type<ResumenCalculo>(),
    creadoPor: uuid("creado_por")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [index("calculos_created_idx").on(t.createdAt)],
);

export const calculoRelativos = pgTable(
  "calculo_relativos",
  {
    calculo: uuid("calculo_id")
      .notNull()
      .references(() => calculos.id, { onDelete: "cascade" }),
    variedad: text("variedad")
      .notNull()
      .references(() => canastaNodos.codigo),
    mes: text("mes").notNull(),
    // Null when no informant had a price in both months.
    valor: doublePrecision("valor"),
    nSuper: integer("n_super").notNull(),
    nTrad: integer("n_trad").notNull(),
  },
  (t) => [primaryKey({ columns: [t.calculo, t.variedad, t.mes] }), index("calculo_relativos_mes_idx").on(t.mes)],
);

export const calculoImputaciones = pgTable(
  "calculo_imputaciones",
  {
    id: id(),
    calculo: uuid("calculo_id")
      .notNull()
      .references(() => calculos.id, { onDelete: "cascade" }),
    variedad: text("variedad")
      .notNull()
      .references(() => canastaNodos.codigo),
    comercio: uuid("comercio_id")
      .notNull()
      .references(() => comercios.id),
    mes: text("mes").notNull(),
    precio: doublePrecision("precio").notNull(),
    // 0 = the variedad itself, 1..n = groups of its hierarchy, last = everything.
    nivel: smallint("nivel").notNull(),
    grupo: text("grupo").notNull(),
    factor: doublePrecision("factor").notNull(),
  },
  (t) => [index("calculo_imputaciones_calculo_idx").on(t.calculo)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Relevamiento = typeof relevamientos.$inferSelect;
export type NewRelevamiento = typeof relevamientos.$inferInsert;
export type Comercio = typeof comercios.$inferSelect;
export type NewComercio = typeof comercios.$inferInsert;
export type CanastaNodo = typeof canastaNodos.$inferSelect;
export type NewCanastaNodo = typeof canastaNodos.$inferInsert;
export type Producto = typeof productos.$inferSelect;
export type NewProducto = typeof productos.$inferInsert;
export type Asignacion = typeof asignaciones.$inferSelect;
export type NewAsignacion = typeof asignaciones.$inferInsert;
export type Precio = typeof precios.$inferSelect;
export type NewPrecio = typeof precios.$inferInsert;
export type PrecioAdjunto = typeof precioAdjuntos.$inferSelect;
export type NewPrecioAdjunto = typeof precioAdjuntos.$inferInsert;
export type PrecioAuditoria = typeof precioAuditoria.$inferSelect;
export type NewPrecioAuditoria = typeof precioAuditoria.$inferInsert;
export type Calculo = typeof calculos.$inferSelect;
export type NewCalculo = typeof calculos.$inferInsert;
export type CalculoRelativo = typeof calculoRelativos.$inferSelect;
export type NewCalculoRelativo = typeof calculoRelativos.$inferInsert;
export type CalculoImputacion = typeof calculoImputaciones.$inferSelect;
export type NewCalculoImputacion = typeof calculoImputaciones.$inferInsert;
