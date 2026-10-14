CREATE TYPE "public"."estado_calculo" AS ENUM('COMPLETADO', 'FALLIDO');--> statement-breakpoint
CREATE TABLE "calculo_imputaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculo_id" uuid NOT NULL,
	"variedad" text NOT NULL,
	"comercio_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"precio" double precision NOT NULL,
	"nivel" smallint NOT NULL,
	"grupo" text NOT NULL,
	"factor" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calculo_relativos" (
	"calculo_id" uuid NOT NULL,
	"variedad" text NOT NULL,
	"mes" text NOT NULL,
	"valor" double precision,
	"n_super" integer NOT NULL,
	"n_trad" integer NOT NULL,
	CONSTRAINT "calculo_relativos_calculo_id_variedad_mes_pk" PRIMARY KEY("calculo_id","variedad","mes")
);
--> statement-breakpoint
CREATE TABLE "calculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mes_base" text NOT NULL,
	"mes_objetivo" text NOT NULL,
	"excluir_ofertas" boolean DEFAULT false NOT NULL,
	"parametros" jsonb NOT NULL,
	"motor_version" text,
	"entrada_hash" text NOT NULL,
	"estado" "estado_calculo" NOT NULL,
	"error" text,
	"resumen" jsonb,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calculo_imputaciones" ADD CONSTRAINT "calculo_imputaciones_calculo_id_calculos_id_fk" FOREIGN KEY ("calculo_id") REFERENCES "public"."calculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculo_imputaciones" ADD CONSTRAINT "calculo_imputaciones_variedad_canasta_nodos_codigo_fk" FOREIGN KEY ("variedad") REFERENCES "public"."canasta_nodos"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculo_imputaciones" ADD CONSTRAINT "calculo_imputaciones_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculo_relativos" ADD CONSTRAINT "calculo_relativos_calculo_id_calculos_id_fk" FOREIGN KEY ("calculo_id") REFERENCES "public"."calculos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculo_relativos" ADD CONSTRAINT "calculo_relativos_variedad_canasta_nodos_codigo_fk" FOREIGN KEY ("variedad") REFERENCES "public"."canasta_nodos"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculos" ADD CONSTRAINT "calculos_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calculo_imputaciones_calculo_idx" ON "calculo_imputaciones" USING btree ("calculo_id");--> statement-breakpoint
CREATE INDEX "calculo_relativos_mes_idx" ON "calculo_relativos" USING btree ("mes");--> statement-breakpoint
CREATE INDEX "calculos_created_idx" ON "calculos" USING btree ("created_at");