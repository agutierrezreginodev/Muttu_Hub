-- supabase/seed_demo.sql
--
-- Data de prueba para demo con el cliente. SE CORRE DESPUÉS de:
--   1. supabase db reset
--   2. pnpm bootstrap:admin --email admin@... --nombre "..."
--      (y abrís el mail de Mailpit para activar la cuenta)
--
-- Cómo correrlo:
--   docker exec -i $(docker ps -qf name=supabase_db_MUTTU_HUB) \
--     psql -U postgres -d postgres < supabase/seed_demo.sql
-- O desde Supabase Studio: SQL Editor → New query → pegás el contenido.
--
-- QUÉ HACE:
--   1. Siembra los 10 catálogos que las migraciones NO crean y que la app
--      necesita para funcionar (cliente.tipo_cliente, contacto.perfil_decision,
--      documento.categoria, kanban.columna_tablero, etc.).
--   2. Otorga categorías de documento a los 4 roles.
--   3. Crea 3 clientes, 5 contactos, 3 oportunidades, 3 entradas de
--      bitácora, 3 documentos con versiones, 8 tareas kanban.
--
-- QUÉ NO HACE:
--   - NO sube archivos reales a Storage. Los registros de documento se
--     crean con storage_path ficticio, así que aparecen en la UI pero
--     la descarga va a fallar con 404. Si querés downloads reales,
--     subilos desde la UI después de correr este seed.
--   - NO crea el admin. Eso lo hace scripts/bootstrap-admin.ts antes.
--   - NO es destructivo. Re-ejecutarlo es seguro (todo es upsert).
--
-- IMPLEMENTACIÓN:
--   - Los IDs se generan automáticamente (no se especifican).
--   - Las referencias entre tablas se hacen por nombre (subselects).
--   - El JWT se setea localmente para que los triggers de audit_fields
--     (que sobreescriben created_by con auth.uid()) tengan un valor.
--   - Es idempotente: podés re-ejecutarlo.
--
-- ============================================================================

\set ON_ERROR_STOP on

-- ============================================================================
-- 1. CATÁLOGOS FALTANTES
-- ============================================================================

-- Tipo de cliente
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('tipo_cliente', 'pyme',          'PyME',          1),
  ('tipo_cliente', 'corporativo',   'Corporativo',   2),
  ('tipo_cliente', 'emprendimiento','Emprendimiento',3),
  ('tipo_cliente', 'gobierno',      'Gobierno',      4)
on conflict (tipo, codigo) do nothing;

-- Tamaño de organización
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('tamano_organizacion', 'micro',   'Micro (1-10)',         1),
  ('tamano_organizacion', 'pequena', 'Pequeña (11-50)',      2),
  ('tamano_organizacion', 'mediana', 'Mediana (51-250)',     3),
  ('tamano_organizacion', 'grande',  'Grande (251+)',        4)
on conflict (tipo, codigo) do nothing;

-- Canal de contacto inicial
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('canal_contacto', 'referido', 'Referido',        1),
  ('canal_contacto', 'web',      'Sitio web',       2),
  ('canal_contacto', 'linkedin', 'LinkedIn',        3),
  ('canal_contacto', 'evento',   'Evento / Feria',  4),
  ('canal_contacto', 'otro',     'Otro',            5)
on conflict (tipo, codigo) do nothing;

-- Nivel de madurez del cliente
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('nivel_madurez', 'explorador', 'Explorador', 1),
  ('nivel_madurez', 'consciente', 'Consciente', 2),
  ('nivel_madurez', 'decidido',   'Decidido',   3),
  ('nivel_madurez', 'avanzado',   'Avanzado',   4)
on conflict (tipo, codigo) do nothing;

-- Perfil de decisión del contacto
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('perfil_decision', 'decisor',    'Decisor',       1),
  ('perfil_decision', 'influencer', 'Influenciador', 2),
  ('perfil_decision', 'usuario',    'Usuario',       3),
  ('perfil_decision', 'gatekeeper', 'Portero',       4)
on conflict (tipo, codigo) do nothing;

-- Estados de oportunidad (abierta ya está sembrada por la migración)
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('estado_oportunidad', 'en_curso', 'En curso', 2),
  ('estado_oportunidad', 'ganada',   'Ganada',   3),
  ('estado_oportunidad', 'perdida',  'Perdida',  4)
on conflict (tipo, codigo) do nothing;

-- Servicio de interés
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('servicio_interes', 'consultoria',    'Consultoría',     1),
  ('servicio_interes', 'capacitacion',   'Capacitación',    2),
  ('servicio_interes', 'implementacion', 'Implementación',  3),
  ('servicio_interes', 'soporte',        'Soporte',         4)
on conflict (tipo, codigo) do nothing;

-- Categoría de documento
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'contratos',  'Contratos',    1),
  ('categoria_documento', 'propuestas', 'Propuestas',   2),
  ('categoria_documento', 'onboarding', 'Onboarding',   3),
  ('categoria_documento', 'interno',    'Interno',      4),
  ('categoria_documento', 'legal',      'Legal',        5),
  ('categoria_documento', 'fiscal',     'Fiscal',       6)
on conflict (tipo, codigo) do nothing;

-- Columnas del tablero kanban: NO se seedean acá.
--
-- Las define la migración 20260730181704_kanban_tablero.sql (kanban-module PR1a),
-- con el juego canónico del PRD §5.1: por_hacer, en_curso, en_revision, cumplido,
-- cancelado. Este archivo las seedeaba por su cuenta (`pendiente`, `en_curso`,
-- `en_revision`, `hecho`) porque se escribió ANTES de que esa migración existiera.
--
-- Al coexistir ambos juegos el tablero mostraba 7 columnas, con dos pares que
-- significan lo mismo (Pendiente/Por hacer y Completada/Hecho). El `on conflict do
-- nothing` no lo evitaba: los códigos son distintos, así que no hay conflicto que
-- detectar. Los valores de `columna` en las tareas de abajo usan los canónicos.

-- Etiquetas kanban
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('etiqueta_tarea', 'urgente',      'Urgente',       1),
  ('etiqueta_tarea', 'cliente-a',    'Cliente A',     2),
  ('etiqueta_tarea', 'cliente-b',    'Cliente B',     3),
  ('etiqueta_tarea', 'interno',      'Interno',       4),
  ('etiqueta_tarea', 'facturacion',  'Facturación',   5),
  ('etiqueta_tarea', 'reunion',      'Reunión',       6)
on conflict (tipo, codigo) do nothing;

-- ============================================================================
-- 2. PERMISOS DE CATEGORÍA DE DOCUMENTO
-- ============================================================================
-- Sin estas filas, NADIE puede ver documentos (ni siquiera el admin).
-- La RLS via private.categoria_visible() requiere un grant explícito.

insert into public.documento_categoria_permiso (rol_id, categoria)
select r.id, c.codigo
from public.rol r
cross join (values
  ('contratos'), ('propuestas'), ('onboarding'), ('interno'),
  ('legal'), ('fiscal')
) as c(codigo)
where r.nombre = 'Administrador'
on conflict (rol_id, categoria) do nothing;

insert into public.documento_categoria_permiso (rol_id, categoria)
select r.id, c.codigo
from public.rol r
cross join (values
  ('contratos'), ('propuestas'), ('onboarding')
) as c(codigo)
where r.nombre = 'Gerencia'
on conflict (rol_id, categoria) do nothing;

insert into public.documento_categoria_permiso (rol_id, categoria)
select r.id, c.codigo
from public.rol r
cross join (values
  ('contratos'), ('propuestas'), ('onboarding'), ('interno')
) as c(codigo)
where r.nombre = 'Coordinador'
on conflict (rol_id, categoria) do nothing;

-- El Colaborador NO recibe categoría de documento (su rol de base no lo permite).

-- ============================================================================
-- 3. DATA DE PRUEBA
-- ============================================================================
-- El contexto JWT se setea DENTRO del do block (set local solo funciona en
-- transacciones, y do abre implícitamente una). Sin esto, los triggers
-- private.audit_fields sobreescriben created_by con auth.uid() = null
-- y todos los inserts fallan.

do $$
declare
  v_admin_id uuid;
  v_cliente_a_id bigint;
  v_cliente_b_id bigint;
  v_cliente_c_id bigint;
  v_doc_contrato_id bigint;
  v_doc_propuesta_id bigint;
  v_doc_onboarding_id bigint;
begin
  -- 3.0 Resolver el UUID del primer admin
  select u.id into v_admin_id
  from public.usuario u
  join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador'
    and u.activo = true
    and u.deleted_at is null
  order by u.created_at asc
  limit 1;

  if v_admin_id is null then
    raise exception 'No se encontró un usuario Administrador activo. Corré pnpm bootstrap:admin antes de este seed.';
  end if;

  -- Setear el contexto JWT con el UUID real del admin. Los triggers
  -- private.audit_fields sobreescriben created_by/updated_by con
  -- auth.uid(), y la FK cliente_created_by_fkey requiere que el UUID
  -- exista en public.usuario.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'service_role')::text,
    false);

  -- ---------------------------------------------------------------------
  -- 3.1 Clientes (3)
  -- ---------------------------------------------------------------------
  -- Idempotente por (nombre): si ya existe, no se duplica.
  insert into public.cliente (nombre, tipo_cliente, tipo_cliente_cat_tipo, estado, estado_cat_tipo,
    empresa, tamano_organizacion, tamano_organizacion_cat_tipo,
    ubicacion, canal_contacto_inicial, canal_contacto_inicial_cat_tipo,
    fecha_primer_contacto, prioridad, prioridad_cat_tipo,
    nivel_madurez, nivel_madurez_cat_tipo, responsable_interno_id)
  values ('Grupo Andino S.A.', 'corporativo', 'tipo_cliente', 'activo', 'estado_cliente',
    'Grupo Andino S.A.', 'mediana', 'tamano_organizacion',
    'Bogotá, Colombia', 'referido', 'canal_contacto',
    '2026-01-15', 'Alta', 'prioridad',
    'decidido', 'nivel_madurez', v_admin_id)
  on conflict do nothing
  returning id into v_cliente_a_id;

  if v_cliente_a_id is null then
    select id into v_cliente_a_id from public.cliente where nombre = 'Grupo Andino S.A.' and deleted_at is null limit 1;
  end if;

  insert into public.cliente (nombre, tipo_cliente, tipo_cliente_cat_tipo, estado, estado_cat_tipo,
    empresa, tamano_organizacion, tamano_organizacion_cat_tipo,
    ubicacion, canal_contacto_inicial, canal_contacto_inicial_cat_tipo,
    fecha_primer_contacto, prioridad, prioridad_cat_tipo,
    nivel_madurez, nivel_madurez_cat_tipo, responsable_interno_id)
  values ('Distribuidora del Sur', 'pyme', 'tipo_cliente', 'activo', 'estado_cliente',
    'Distribuidora del Sur Ltda.', 'pequena', 'tamano_organizacion',
    'Medellín, Colombia', 'web', 'canal_contacto',
    '2026-04-22', 'Media', 'prioridad',
    'consciente', 'nivel_madurez', v_admin_id)
  on conflict do nothing
  returning id into v_cliente_b_id;

  if v_cliente_b_id is null then
    select id into v_cliente_b_id from public.cliente where nombre = 'Distribuidora del Sur' and deleted_at is null limit 1;
  end if;

  insert into public.cliente (nombre, tipo_cliente, tipo_cliente_cat_tipo, estado, estado_cat_tipo,
    empresa, tamano_organizacion, tamano_organizacion_cat_tipo,
    ubicacion, canal_contacto_inicial, canal_contacto_inicial_cat_tipo,
    fecha_primer_contacto, prioridad, prioridad_cat_tipo,
    nivel_madurez, nivel_madurez_cat_tipo, responsable_interno_id)
  values ('Inversiones Pacífica', 'corporativo', 'tipo_cliente', 'standby', 'estado_cliente',
    'Inversiones Pacífica S.A.S.', 'grande', 'tamano_organizacion',
    'Cali, Colombia', 'linkedin', 'canal_contacto',
    '2025-11-03', 'Baja', 'prioridad',
    'explorador', 'nivel_madurez', v_admin_id)
  on conflict do nothing
  returning id into v_cliente_c_id;

  if v_cliente_c_id is null then
    select id into v_cliente_c_id from public.cliente where nombre = 'Inversiones Pacífica' and deleted_at is null limit 1;
  end if;

  -- ---------------------------------------------------------------------
  -- 3.2 Contactos (5)
  -- ---------------------------------------------------------------------
  -- Grupo Andino: 3 contactos; Distribuidora: 2 contactos.
  insert into public.contacto (cliente_id, nombre, cargo, correo, telefono, notas, perfil_decision, perfil_decision_cat_tipo)
  values (v_cliente_a_id, 'María Restrepo', 'CEO', 'maria.restrepo@grupoandino.co', '+57 310 555 1001', 'Decisor final. Prefiere comunicarse por email.', 'decisor', 'perfil_decision'),
         (v_cliente_a_id, 'Carlos Mendoza', 'Director de TI', 'cmendoza@grupoandino.co', '+57 310 555 1002', 'Punto de contacto técnico. Muy operativo.', 'influencer', 'perfil_decision'),
         (v_cliente_a_id, 'Laura Sánchez', 'Coordinadora Admin', 'laura.sanchez@grupoandino.co', '+57 310 555 1003', 'Maneja la facturación y los pagos.', 'gatekeeper', 'perfil_decision'),
         (v_cliente_b_id, 'Pedro Ramírez', 'Gerente General', 'pedro@disur.com', '+57 311 555 2001', 'Fundador. Toma todas las decisiones.', 'decisor', 'perfil_decision'),
         (v_cliente_b_id, 'Ana Ortiz', 'Asistente', 'ana.ortiz@disur.com', '+57 311 555 2002', 'Coordina las reuniones y los follow-ups.', 'usuario', 'perfil_decision')
  on conflict do nothing;

  -- ---------------------------------------------------------------------
  -- 3.3 Oportunidades (3)
  -- ---------------------------------------------------------------------
  insert into public.oportunidad (cliente_id, nombre, problema_detectado, solucion_propuesta, valor_estimado_cop, estado, estado_cat_tipo, fecha_ultima_gestion)
  values (v_cliente_a_id, 'Migración ERP a la nube', 'ERP on-premise con costos de mantenimiento crecientes y sin escalabilidad.', 'Migración a ERP cloud + integración con su e-commerce + capacitación al equipo.', 85000000, 'en_curso', 'estado_oportunidad', current_date - 3),
         (v_cliente_a_id, 'Capacitación en ciberseguridad', 'Equipo sin formación actualizada en protección de datos.', 'Programa de 4 workshops mensuales + simulacro de phishing.', 12000000, 'abierta', 'estado_oportunidad', current_date - 1),
         (v_cliente_b_id, 'Implementación sistema de facturación', 'Facturación manual en Excel, propenso a errores y demoras.', 'Implementación de sistema POS + integración con DIAN.', 25000000, 'ganada', 'estado_oportunidad', current_date - 7)
  on conflict do nothing;

  -- Servicios de las oportunidades
  insert into public.oportunidad_servicio (oportunidad_id, cliente_id, servicio_codigo, servicio_cat_tipo)
  select o.id, o.cliente_id, s.codigo, 'servicio_interes'
  from public.oportunidad o
  cross join lateral (
    values
      ('Migración ERP a la nube',         array['implementacion','consultoria']),
      ('Capacitación en ciberseguridad',  array['capacitacion']),
      ('Implementación sistema de facturación', array['implementacion','soporte'])
  ) as m(nombre_oportunidad, servicios)
  cross join lateral unnest(m.servicios) as s(codigo)
  where o.nombre = m.nombre_oportunidad and o.deleted_at is null
  on conflict (oportunidad_id, servicio_codigo) do nothing;

  -- ---------------------------------------------------------------------
  -- 3.4 Bitácora (3 entradas)
  -- ---------------------------------------------------------------------
  insert into public.bitacora_cliente (cliente_id, autor_id, texto, created_at)
  values (v_cliente_a_id, v_admin_id, 'Llamada inicial con María Restrepo. Confirmó interés en migración a la nube. Quedó en agendar demo con el equipo técnico la próxima semana.', current_timestamp - interval '10 days'),
         (v_cliente_a_id, v_admin_id, 'Reunión con Carlos Mendoza (TI). Hicimos el relevamiento de la infraestructura actual. Tiene 3 servidores on-premise y bases de datos Oracle.', current_timestamp - interval '5 days'),
         (v_cliente_a_id, v_admin_id, 'Enviada propuesta económica v1. Pendiente feedback de María.', current_timestamp - interval '1 day')
  on conflict do nothing;

  -- ---------------------------------------------------------------------
  -- 3.5 Documentos (3, distintos categorías y con versiones)
  -- ---------------------------------------------------------------------
  insert into public.documento (cliente_id, nombre, categoria, categoria_cat_tipo, descripcion, tags)
  values (v_cliente_a_id, 'Contrato marco de servicios 2026', 'contratos', 'categoria_documento', 'Contrato marco firmado entre el estudio y Grupo Andino S.A. para el período 2026.', array['firmado','2026']),
         (v_cliente_a_id, 'Propuesta económica migración ERP', 'propuestas', 'categoria_documento', 'Propuesta económica v2 enviada a María Restrepo. Pendiente feedback.', array['v2','pendiente']),
         (v_cliente_a_id, 'Onboarding cliente — checklist inicial', 'onboarding', 'categoria_documento', 'Lista de tareas de onboarding para el primer mes de trabajo.', array['onboarding','mes-1'])
  on conflict do nothing;

  -- Capturar IDs por nombre (idempotente)
  select id into v_doc_contrato_id from public.documento where cliente_id = v_cliente_a_id and nombre = 'Contrato marco de servicios 2026' and deleted_at is null limit 1;
  select id into v_doc_propuesta_id from public.documento where cliente_id = v_cliente_a_id and nombre = 'Propuesta económica migración ERP' and deleted_at is null limit 1;
  select id into v_doc_onboarding_id from public.documento where cliente_id = v_cliente_a_id and nombre = 'Onboarding cliente — checklist inicial' and deleted_at is null limit 1;

  -- Versiones: el primer doc tiene 2, los otros 1.
  -- Los storage_path y size_bytes son placeholder que después se ajustan
  -- con scripts/upload-demo-pdfs.ts. Aceptable que difieran al momento
  -- del seed porque la app muestra size_bytes en MB redondeado y el delta
  -- es invisible para la demo.
  insert into public.documento_version (documento_id, cliente_id, version, storage_bucket, storage_path, original_filename, size_bytes, mime_type, uploaded_by)
  values (v_doc_contrato_id, v_cliente_a_id, 1, 'documentos', v_cliente_a_id || '/' || v_doc_contrato_id || '/1/v1_contrato.pdf', 'contrato_grupo_andino_2026.pdf', 2640, 'application/pdf', v_admin_id),
         (v_doc_contrato_id, v_cliente_a_id, 2, 'documentos', v_cliente_a_id || '/' || v_doc_contrato_id || '/2/v2_contrato.pdf', 'contrato_grupo_andino_2026_v2.pdf', 2640, 'application/pdf', v_admin_id),
         (v_doc_propuesta_id, v_cliente_a_id, 1, 'documentos', v_cliente_a_id || '/' || v_doc_propuesta_id || '/1/v1_propuesta.pdf', 'propuesta_migracion_erp_v1.pdf', 2747, 'application/pdf', v_admin_id),
         (v_doc_onboarding_id, v_cliente_a_id, 1, 'documentos', v_cliente_a_id || '/' || v_doc_onboarding_id || '/1/v1_onboarding.pdf', 'onboarding_checklist.pdf', 2538, 'application/pdf', v_admin_id)
  on conflict do nothing;

  -- ---------------------------------------------------------------------
  -- 3.6 Tareas Kanban (8, distribuidas en columnas)
  -- ---------------------------------------------------------------------
  -- El campo `columna` mapea a la columna del tablero (catalogo columna_tablero).
  -- `estado` se deriva: pendiente/en_curso/en_revision -> en_curso o pendiente,
  --                     hecho -> cumplido.

  insert into public.tarea (titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, prioridad_cat_tipo, columna, columna_cat_tipo, etiquetas, origen)
  values -- Columna: Pendiente
         ('Revisar contrato marco con Grupo Andino', 'Verificar que las cláusulas de SLA coincidan con lo conversado en la última reunión.', v_admin_id, v_cliente_a_id, current_date + interval '2 days', 'pendiente', 'Alta', 'prioridad', 'por_hacer', 'columna_tablero', array['urgente','cliente-a'], 'Ambos'),
         ('Agendar demo técnica con equipo de TI', 'Coordinar con Carlos Mendoza fecha para el demo del nuevo ERP.', v_admin_id, v_cliente_a_id, current_date + interval '5 days', 'pendiente', 'Media', 'prioridad', 'por_hacer', 'columna_tablero', array['reunion','cliente-a'], 'Kanban'),
         ('Preparar propuesta económica v2', 'Ajustar márgenes según feedback de María y reenviar.', v_admin_id, v_cliente_a_id, current_date + interval '1 day', 'pendiente', 'Alta', 'prioridad', 'por_hacer', 'columna_tablero', array['urgente','facturacion','cliente-a'], 'Kanban'),
         -- Columna: En curso
         ('Implementación sistema facturación Disur', 'Configurando el POS y la integración con DIAN. Llevamos 60% de avance.', v_admin_id, v_cliente_b_id, current_date + interval '7 days', 'en_curso', 'Alta', 'prioridad', 'en_curso', 'columna_tablero', array['cliente-b'], 'Kanban'),
         ('Workshop de ciberseguridad — preparación', 'Armando los slides del primer workshop del programa mensual.', v_admin_id, v_cliente_a_id, current_date + interval '3 days', 'en_curso', 'Media', 'prioridad', 'en_curso', 'columna_tablero', array['reunion','interno'], 'Kanban'),
         -- Columna: En revisión (estado sigue siendo en_curso)
         ('Migración de base de datos Oracle a PostgreSQL', 'Migración en revisión por el equipo de TI del cliente. Pendiente aprobación.', v_admin_id, v_cliente_a_id, current_date + interval '4 days', 'en_curso', 'Alta', 'prioridad', 'en_revision', 'columna_tablero', array['cliente-a'], 'Kanban'),
         -- Columna: Hecho
         ('Kickoff con Grupo Andino', 'Reunión de kickoff realizada. Acta firmada y enviada.', v_admin_id, v_cliente_a_id, current_date - interval '8 days', 'cumplido', 'Alta', 'prioridad', 'cumplido', 'columna_tablero', array['cliente-a'], 'Ambos'),
         ('Cierre administrativo contrato Disur', 'Contrato firmado y archivado en el sistema.', v_admin_id, v_cliente_b_id, current_date - interval '12 days', 'cumplido', 'Media', 'prioridad', 'cumplido', 'columna_tablero', array['cliente-b','facturacion'], 'Kanban')
  on conflict do nothing;

  -- ---------------------------------------------------------------------
  -- 3.7 Compromisos y tareas relacionadas (4)
  -- ---------------------------------------------------------------------
  -- origen='CRM' aparece en la pestaña "Compromisos" o "Tareas" de la ficha
  -- del cliente, NO en el kanban.
  insert into public.tarea (titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, prioridad_cat_tipo, etiquetas, origen)
  values ('Compromiso: entregar dashboard mensual de KPIs', 'María pidió un dashboard mensual con KPIs operativos. Compromiso formal.', v_admin_id, v_cliente_a_id, current_date + interval '15 days', 'pendiente', 'Alta', 'prioridad', array['cliente-a'], 'CRM'),
         ('Compromiso: soporte 24/7 primer mes post go-live', 'Disur pidió soporte 24/7 el primer mes después del go-live del POS.', v_admin_id, v_cliente_b_id, current_date + interval '30 days', 'pendiente', 'Alta', 'prioridad', array['cliente-b'], 'CRM'),
         ('Levantar requerimientos del dashboard de KPIs', 'Reunión con María para definir qué KPIs quiere ver en el dashboard.', v_admin_id, v_cliente_a_id, current_date + interval '3 days', 'en_curso', 'Alta', 'prioridad', array['cliente-a'], 'CRM'),
         ('Configurar canal de soporte 24/7', 'Activar línea de WhatsApp Business + correo prioritario para Disur.', v_admin_id, v_cliente_b_id, current_date + interval '20 days', 'pendiente', 'Alta', 'prioridad', array['cliente-b'], 'CRM')
  on conflict do nothing;

  raise notice 'Seed demo aplicado correctamente. Admin UUID: %', v_admin_id;
end
$$;

-- ============================================================================
-- 4. RESUMEN
-- ============================================================================
select 'roles' as tabla, count(*) as total from public.rol
union all select 'catalogos', count(*) from public.catalogo
union all select 'usuarios',  count(*) from public.usuario
union all select 'clientes',  count(*) from public.cliente where deleted_at is null
union all select 'contactos', count(*) from public.contacto where deleted_at is null
union all select 'oportunidades', count(*) from public.oportunidad where deleted_at is null
union all select 'bitacoras',  count(*) from public.bitacora_cliente
union all select 'documentos', count(*) from public.documento where deleted_at is null
union all select 'versiones',  count(*) from public.documento_version
union all select 'tareas', count(*) from public.tarea where deleted_at is null
union all select 'permisos doc', count(*) from public.documento_categoria_permiso;
