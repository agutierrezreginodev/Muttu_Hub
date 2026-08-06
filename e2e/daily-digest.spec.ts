import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  E2E_ADMIN_EMAIL,
} from "./env";
import { countMessagesTo, waitForMessageTo } from "./utils/mailpit";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/daily-digest`;

/**
 * Daily digest, end to end (kanban slices 11a/11b/12).
 *
 * PREREQUISITE: the stack must have been started with the digest variables
 * exported, so `[edge_runtime.secrets]`'s `env(...)` references resolve —
 * `APP_BASE_URL`, `DIGEST_FROM_EMAIL`, `DIGEST_TRANSPORT=mailpit`,
 * `MAILPIT_BASE_URL`. CI's e2e job sets them on its `supabase start` step.
 * Without them the function answers 500 `missing_configuration`, and this
 * suite fails loudly with that body rather than skipping quietly — a skipped
 * mail test is indistinguishable from a passing one.
 *
 * Everything here goes through the REAL function over HTTP and the REAL
 * Mailpit. The unit tests already cover classification and rendering; what
 * only a live run can prove is that the gates, the grants, the idempotency
 * write and the transport actually line up.
 */
test.describe("daily digest", () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function invoke(headers: Record<string, string> = {}, method = "POST") {
    const context = await playwrightRequest.newContext();
    const response = await context.fetch(FUNCTION_URL, { method, headers });
    const body = await response.text();
    await context.dispose();
    return { status: response.status(), body };
  }

  const authorized = {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  test("refuses GET — a digest run is a mutation", async () => {
    const { status, body } = await invoke(authorized, "GET");

    expect(status).toBe(405);
    expect(body).toContain("method_not_allowed");
  });

  test("refuses a caller without the service-role key", async () => {
    // The anon key, NOT a garbage string. `verify_jwt` rejects a malformed
    // token at the platform edge with its own error, which would make this
    // test pass without the handler's check ever running. A valid JWT that
    // simply is not the service-role key is what actually exercises it.
    const { status, body } = await invoke({
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    });

    expect(status).toBe(401);
    expect(body).toContain("unauthorized");
  });

  test("sends one digest, then nothing more the same Bogota day", async () => {
    test.setTimeout(180_000);

    const sinceIso = new Date().toISOString();
    const email = `digest-${Date.now()}@muttu-hub.test`;

    // A user of its own, so this spec shares no state with any other and a
    // retry starts where the first run did.
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password: "DigestE2ePass123",
        email_confirm: true,
      });
    expect(createError).toBeNull();
    const usuarioId = created!.user!.id;

    const { data: rol } = await supabase
      .from("rol")
      .select("id")
      .eq("nombre", "Administrador")
      .maybeSingle();

    const { error: usuarioError } = await supabase
      .from("usuario")
      .insert({ id: usuarioId, nombre: "Digest E2E", email, rol_id: rol!.id });
    expect(usuarioError).toBeNull();

    const dias = (n: number) =>
      new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

    // Seeded through a USER-scoped client, not the service role. The audit
    // trigger fills created_by from auth.uid(), which is null under the
    // service role — the insert then violates a not-null constraint. Ignoring
    // that error is exactly how this test first "passed the setup" and then
    // reported enviados: 0 with no tareas in the database at all.
    const asUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await asUsuario.auth.signInWithPassword({
      email,
      password: "DigestE2ePass123",
    });
    expect(signInError).toBeNull();

    const { error: tareaError } = await asUsuario.from("tarea").insert([
      // Counts: overdue and owned.
      { titulo: `E2E vencida ${Date.now()}`, responsable_id: usuarioId, fecha_limite: dias(-2), estado: "pendiente", origen: "Kanban" },
      // Counts: inside the 72h window.
      { titulo: `E2E pronto ${Date.now()}`, responsable_id: usuarioId, fecha_limite: dias(2), estado: "en_curso", origen: "Kanban" },
      // Must NOT count: past due, but a borrador nobody owns (VM1/C10).
      { titulo: `E2E borrador ${Date.now()}`, responsable_id: null, fecha_limite: dias(-3), estado: "borrador", origen: "Kanban" },
    ]);
    expect(tareaError).toBeNull();

    // --- First run ---
    const first = await invoke(authorized);
    expect(first.status).toBe(200);
    expect(JSON.parse(first.body).enviados).toBeGreaterThanOrEqual(1);

    const message = await waitForMessageTo(email, sinceIso);
    expect(message.subject).toContain("vencidas");
    expect(message.text).toContain("E2E vencida");
    expect(message.text).toContain("E2E pronto");
    // The regression this whole model is shaped around.
    expect(message.text).not.toContain("E2E borrador");

    // The idempotency row records what was actually reported: two items, not
    // the three tareas that exist.
    const { data: envio } = await supabase
      .from("digest_envio")
      .select("item_count")
      .eq("usuario_id", usuarioId)
      .maybeSingle();
    expect(envio?.item_count).toBe(2);

    // --- Second run, same Bogota day ---
    const second = await invoke(authorized);
    expect(second.status).toBe(200);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.ya_enviados).toBeGreaterThanOrEqual(1);

    // No second email. Counted rather than "not visible", so a slow delivery
    // cannot make this pass by arriving late.
    expect(await countMessagesTo(email)).toBe(1);

    // --- Opted out: no email, no digest_envio row ---
    const optedOutEmail = `digest-out-${Date.now()}@muttu-hub.test`;
    const { data: optedOutUser } = await supabase.auth.admin.createUser({
      email: optedOutEmail,
      password: "DigestE2EPass123",
      email_confirm: true,
    });
    const optedOutId = optedOutUser!.user!.id;
    await supabase.from("usuario").insert({
      id: optedOutId,
      nombre: "Digest Opt Out",
      email: optedOutEmail,
      rol_id: rol!.id,
    });
    const asOptedOut = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await asOptedOut.auth.signInWithPassword({
      email: optedOutEmail,
      password: "DigestE2EPass123",
    });
    const { error: optOutTareaError } = await asOptedOut.from("tarea").insert({
      titulo: `E2E opt-out ${Date.now()}`,
      responsable_id: optedOutId,
      fecha_limite: dias(-1),
      estado: "pendiente",
      origen: "Kanban",
    });
    expect(optOutTareaError).toBeNull();
    // Written by the USER, never by the service role. Slice 3 grants
    // service_role only SELECT here — "the digest READS the opt-out flag and
    // never writes it" — so a service-role insert silently fails and leaves
    // the user opted IN, which is precisely how this test first sent mail to
    // someone who had asked not to receive it.
    const { error: prefError } = await asOptedOut
      .from("notificacion_preferencia")
      .insert({ usuario_id: optedOutId, resumen_diario_email: false });
    expect(prefError).toBeNull();

    await invoke(authorized);

    expect(await countMessagesTo(optedOutEmail)).toBe(0);
    const { data: sinEnvio } = await supabase
      .from("digest_envio")
      .select("id")
      .eq("usuario_id", optedOutId);
    expect(sinEnvio ?? []).toHaveLength(0);

    // --- Cleanup ---
    await supabase.from("tarea").delete().eq("responsable_id", usuarioId);
    await supabase.from("tarea").delete().eq("responsable_id", optedOutId);
    await supabase.from("digest_envio").delete().eq("usuario_id", usuarioId);
    await supabase.auth.admin.deleteUser(usuarioId);
    await supabase.auth.admin.deleteUser(optedOutId);
  });

  test("a user with nothing due receives nothing", async () => {
    test.setTimeout(120_000);

    // The seeded admin has no tareas of its own in a fresh database. Asserted
    // through the counts the function reports rather than by waiting for an
    // email that should never arrive — waiting for absence is a timeout, not
    // a test.
    const before = await countMessagesTo(E2E_ADMIN_EMAIL);
    const { status, body } = await invoke(authorized);

    expect(status).toBe(200);
    expect(JSON.parse(body)).toHaveProperty("sin_contenido");
    expect(await countMessagesTo(E2E_ADMIN_EMAIL)).toBe(before);
  });
});
