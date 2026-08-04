/**
 * Bounds required by spec document-zip-export "Streaming assembly with bounds".
 * The specific numbers are open question 7, still unresolved by the owner — the
 * spec mandates that a cap exist, so these are deliberate, documented defaults
 * rather than invented product limits, and both are exported so the tests (and
 * a future owner decision) reference the constant instead of a literal.
 *
 * Because the archive STREAMS, memory is bounded by chunk size rather than by
 * total size; what these protect is the serverless function's wall-clock
 * budget, which is why the count cap is the tighter of the two.
 *
 * THEY LIVE IN THIS FILE, not in `route.ts`, for a hard framework reason: Next
 * validates the export surface of a Route Handler and permits only its own
 * named exports (`GET`/`POST`/`runtime`/`dynamic`/…). Any extra export — such
 * as these two constants — fails `next build` with:
 *
 *   Type error: Route "…/descargar-zip/route.ts" does not match the required
 *   types of a Next.js Route. "MAX_ZIP_DOCUMENTS" is not a valid Route export
 *   field.
 *
 * `tsc --noEmit` does NOT apply that route-type validation, so this is only
 * caught by a real production build.
 */
export const MAX_ZIP_DOCUMENTS = 50;
export const MAX_ZIP_TOTAL_BYTES = 200 * 1024 * 1024;
