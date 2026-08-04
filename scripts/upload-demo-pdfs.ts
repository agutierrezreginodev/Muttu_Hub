// scripts/upload-demo-pdfs.ts
//
// Sube 3 PDFs dummy (4 versiones en total) al bucket "documentos" de
// Supabase Storage local, alineados con los documento_version que crea
// supabase/seed_demo.sql. Después actualiza storage_path via SQL directo
// (bypaseando RLS de la tabla documento_version) para que matcheen la
// convención del bucket ({cliente_id}/{documento_id}/{version}/{filename}).
//
// QUÉ HACE:
//   1. Lee los documento + documento_version del seed
//   2. Genera un PDF con pdfkit por cada versión
//   3. Sube cada PDF al bucket con la convención del repo
//   4. Actualiza documento_version.storage_path via SQL (postgres superuser)
//
// CÓMO CORRERLO:
//   pnpm add -D pdfkit                                    # solo la primera vez
//   eval "$(supabase status -o env)"
//   SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//     NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
//     pnpm tsx scripts/upload-demo-pdfs.ts
//   pnpm remove pdfkit                                    # cleanup opcional
//
// IDEMPOTENTE: si lo corrés dos veces, los archivos en Storage se
// sobreescriben y los storage_path se resetean al valor convencional.

import { createClient } from "@supabase/supabase-js";
// @ts-expect-error -- pdfkit no tiene tipos oficiales
import PDFDocument from "pdfkit";
import { execSync } from "node:child_process";

interface DocumentoRow {
  id: number;
  cliente_id: number;
  nombre: string;
  categoria: string;
}

interface VersionRow {
  id: number;
  documento_id: number;
  cliente_id: number;
  version: number;
  storage_path: string;
  original_filename: string;
}

const STORAGE_BUCKET = "documentos";

function generarPdf(
  titulo: string,
  subtitulo: string,
  parrafos: string[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(24)
      .fillColor("#0a3a5c")
      .text(titulo, { align: "left" });
    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .fillColor("#666")
      .text("Muttu Hub — Documento de demostración", { align: "left" });
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .fillColor("#999")
      .text(subtitulo, { align: "left" });
    doc.moveDown(1.5);

    doc.fillColor("#222");
    for (const p of parrafos) {
      doc.fontSize(12).text(p, { align: "justify" });
      doc.moveDown(0.8);
    }

    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#aaa")
      .text(
        "Este documento es un placeholder generado automáticamente para la demo del producto. No tiene valor contractual ni legal.",
        { align: "center" },
      );

    doc.end();
  });
}

/**
 * Actualiza documento_version.storage_path ejecutando SQL directo contra el
 * container de Postgres. La razón: el service_role client de Supabase JS
 * respeta la policy RLS de documento_version (que es estricta); el rol
 * `postgres` superuser bypasea RLS y puede hacer el UPDATE.
 */
function updateStoragePathsViaSql(rows: { id: number; newPath: string }[]): void {
  if (!rows.length) return;

  // Construir el UPDATE con un CASE por id para hacerlo en una sola query
  const cases = rows
    .map(
      (r) =>
        `WHEN ${r.id} THEN '${r.newPath.replace(/'/g, "''")}'`,
    )
    .join("\n        ");
  const ids = rows.map((r) => r.id).join(",");
  const sql = `
    UPDATE public.documento_version
    SET storage_path = CASE id
        ${cases}
        ELSE storage_path
      END
    WHERE id IN (${ids});
  `;

  // Encontrar el container de postgres
  const container = execSync(
    `docker ps --format '{{.Names}}' | grep -E 'supabase_db_' | head -1`,
  )
    .toString()
    .trim();
  if (!container) {
    throw new Error("No encontré el container de Postgres de Supabase corriendo.");
  }

  execSync(`docker exec -i "${container}" psql -U postgres -d postgres -c "${sql.replace(/"/g, '\\"')}"`, {
    stdio: "inherit",
  });
}

const contenidoPorNombre: Record<
  string,
  { titulo: string; subtitulo: string; parrafos: string[] }
> = {
  "Contrato marco de servicios 2026": {
    titulo: "Contrato Marco de Servicios 2026",
    subtitulo:
      "Grupo Andino S.A. — Muttu Hub · Vigencia: 01/01/2026 a 31/12/2026",
    parrafos: [
      "Entre el estudio Muttu Hub, en adelante 'el Prestador', y Grupo Andino S.A., en adelante 'el Cliente', se celebra el presente contrato marco de servicios profesionales.",
      "CLÁUSULA PRIMERA — OBJETO. El Prestador se obliga a prestar al Cliente servicios de consultoría, implementación y soporte en tecnología, conforme a las órdenes de servicio que se emitan bajo el presente marco.",
      "CLÁUSULA SEGUNDA — VIGENCIA. El presente contrato tiene vigencia de doce (12) meses contados a partir del 1 de enero de 2026, renovable tácitamente por períodos anuales salvo denuncia escrita con 60 días de anticipación.",
      "CLÁUSULA TERCERA — CONFIDENCIALIDAD. Las partes se obligan a mantener la confidencialidad sobre toda información intercambiada en el marco de los servicios, por un período de cinco (5) años posterior a la terminación del contrato.",
      "CLÁUSULA CUARTA — SLA. Los niveles de servicio acordados son: tiempo de respuesta crítico 4 horas, alto 8 horas, normal 24 horas, bajo 72 horas.",
    ],
  },
  "Propuesta económica migración ERP": {
    titulo: "Propuesta Económica — Migración ERP a la Nube",
    subtitulo: "Grupo Andino S.A. — Versión 2 · Pendiente de aprobación",
    parrafos: [
      "La presente propuesta describe el plan de migración del ERP on-premise de Grupo Andino S.A. a una solución cloud de clase enterprise, incluyendo la integración con el sistema de e-commerce existente y la capacitación del equipo interno.",
      "ALCANCE. Migración de las bases de datos Oracle a PostgreSQL gestionado, despliegue de la aplicación ERP en infraestructura cloud, configuración de backups automatizados, integración bidireccional con el e-commerce, y un programa de 3 workshops de capacitación.",
      "INVERSIÓN. La inversión total es de ochenta y cinco millones de pesos ($85.000.000 COP), distribuidos en: 40% al inicio del proyecto, 30% al go-live, 30% a los 60 días del go-live con aceptación firmada.",
      "PLAZO. El plazo total estimado es de 16 semanas desde la firma del contrato: 4 semanas de descubrimiento, 8 semanas de implementación, 2 semanas de testing, 2 semanas de go-live progresivo.",
      "CONDICIONES. Esta propuesta tiene una vigencia de 30 días calendario. Los pagos se realizan contra factura emitida por el Prestador, con NET-30.",
    ],
  },
  "Onboarding cliente — checklist inicial": {
    titulo: "Onboarding — Checklist Primer Mes",
    subtitulo:
      "Grupo Andino S.A. · Período: 01/01/2026 a 01/02/2026",
    parrafos: [
      "Este documento lista las actividades de onboarding correspondientes al primer mes de relación con Grupo Andino S.A. Cada ítem tiene un responsable asignado y una fecha objetivo.",
      "SEMANA 1. Reunión de kickoff con stakeholders clave (realizada el 8 de enero). Relevamiento de infraestructura actual por el equipo de TI. Configuración de canales de comunicación: Slack compartido, grupo de WhatsApp para urgencias.",
      "SEMANA 2. Firma del contrato marco y del NDA. Recolección de accesos administrativos a los sistemas. Designación del equipo de trabajo por ambas partes.",
      "SEMANA 3. Workshop de descubrimiento profundo (problemas, objetivos, restricciones). Inicio del relevamiento funcional del ERP actual. Mapeo de integraciones requeridas.",
      "SEMANA 4. Entrega del informe de descubrimiento. Presentación de la propuesta técnica preliminar. Aprobación del cronograma de implementación.",
    ],
  },
};

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Necesitás NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno. Corré `eval \"$(supabase status -o env)\"` antes.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Leyendo documentos del seed...");
  const { data: documentos, error: docErr } = await supabase
    .from("documento")
    .select("id, cliente_id, nombre, categoria")
    .is("deleted_at", null)
    .order("id");
  if (docErr) throw docErr;

  const { data: versiones, error: verErr } = await supabase
    .from("documento_version")
    .select("id, documento_id, cliente_id, version, storage_path, original_filename")
    .order("id");
  if (verErr) throw verErr;

  if (!documentos?.length || !versiones?.length) {
    console.error(
      "No hay documentos o versiones. Corré supabase/seed_demo.sql primero.",
    );
    process.exit(1);
  }

  console.log(
    `Encontrados ${documentos.length} docs y ${versiones.length} versiones.\n`,
  );

  const docById = new Map<number, DocumentoRow>(documentos.map((d) => [d.id, d]));

  let totalSubidos = 0;
  const updates: { id: number; newPath: string }[] = [];

  for (const ver of versiones as VersionRow[]) {
    const doc = docById.get(ver.documento_id);
    if (!doc) continue;

    const contenido = contenidoPorNombre[doc.nombre] ?? {
      titulo: doc.nombre,
      subtitulo: `Versión ${ver.version} · ${new Date().toLocaleDateString("es-CO")}`,
      parrafos: [
        "Este es un documento de demostración generado para la prueba del producto Muttu Hub.",
        "El contenido real se cargaría desde la aplicación por los usuarios autorizados.",
      ],
    };

    console.log(`  Generando PDF: ${doc.nombre} v${ver.version}...`);
    const pdfBuffer = await generarPdf(
      contenido.titulo,
      contenido.subtitulo,
      contenido.parrafos,
    );

    // Path con la convención del bucket: {cliente_id}/{documento_id}/{version}/{filename}
    const filename = `v${ver.version}_${ver.original_filename.replace(/\.pdf$/i, "")}.pdf`;
    const newPath = `${ver.cliente_id}/${ver.documento_id}/${ver.version}/${filename}`;

    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(newPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) {
      console.error(`  ✗ Upload failed for ${newPath}:`, upErr.message);
      continue;
    }
    totalSubidos++;
    console.log(`  ✓ Subido: ${newPath} (${pdfBuffer.length} bytes)`);

    if (ver.storage_path !== newPath) {
      updates.push({ id: ver.id, newPath });
    }
  }

  if (updates.length) {
    console.log(`\nActualizando ${updates.length} storage_path via SQL...`);
    updateStoragePathsViaSql(updates);
    console.log(`  ✓ ${updates.length} paths actualizados.`);
  }

  console.log(
    `\nListo. ${totalSubidos} PDFs subidos, ${updates.length} paths actualizados.`,
  );
  console.log("Ahora los downloads de documentos van a funcionar desde la UI.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
