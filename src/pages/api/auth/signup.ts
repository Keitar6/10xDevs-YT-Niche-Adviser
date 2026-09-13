import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError } from "@/lib/http";

// Kept in step with MIN_PASSWORD_LENGTH in SignUpForm.tsx so the client and the
// server reject the same passwords.
const MIN_PASSWORD_LENGTH = 6;

const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(1, "Password is required")
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export const POST: APIRoute = async (context) => {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = credentialsSchema.safeParse({ email: body.email, password: body.password });
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0].message, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  // Local Supabase auto-confirms, and returns a session; a project with email
  // confirmation on returns none. That is the honest signal for whether the
  // user still has to click a link, so it replaces the unconditional
  // redirect to the standalone confirmation page.
  return new Response(JSON.stringify({ ok: true, needsConfirmation: !data.session }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
