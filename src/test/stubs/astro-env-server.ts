/**
 * Stand-in for `astro:env/server` under Vitest.
 *
 * `astro:env/server` is a virtual module the Astro build generates; outside a
 * build it does not resolve at all, which is why no route handler could be
 * imported into a test before this existed. `src/lib/supabase.ts` imports it,
 * and every data-touching handler imports `src/lib/supabase.ts`, so without
 * this alias the route suite cannot even load.
 *
 * The four exports mirror the `env.schema` block in `astro.config.mjs:19-22`.
 * **That correspondence is maintained by hand and nothing checks it**: adding a
 * secret to the schema and forgetting it here produces an import-time failure in
 * whichever test first touches the module that reads it.
 *
 * The values are empty on purpose. Every field is declared `optional: true`, and
 * the route tests in this suite never reach a real Supabase call — they assert
 * on the 401 guard, which runs before any client is constructed, and on a
 * module-mocked client where they do go further. An empty `SUPABASE_URL` also
 * makes `createClient` return null rather than attempting a network client, so a
 * test that accidentally falls through fails loudly instead of hanging.
 */
export const SUPABASE_URL = "";
export const SUPABASE_KEY = "";
export const YOUTUBE_API_KEY = "";
export const ANTHROPIC_API_KEY = "";
