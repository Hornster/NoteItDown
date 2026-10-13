import type { APIRoute } from "astro";
import { authErrorMessage, isExistingAccountError } from "@/lib/auth-errors";
import { MESSAGES } from "@/lib/constants/messages";
import { authFormSchema } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase";

export const prerender = false;

function fail(context: Parameters<APIRoute>[0], message: string) {
  return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  // An unparseable body counts as an empty form; the schema then supplies the message.
  const form = await context.request.formData().catch(() => new FormData());
  const parsed = authFormSchema.safeParse({
    email: form.get("email") ?? undefined,
    password: form.get("password") ?? undefined,
  });
  if (!parsed.success) {
    return fail(context, parsed.error.issues[0]?.message ?? MESSAGES.AUTH_FAILED);
  }
  const { email, password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail(context, MESSAGES.SUPABASE_NOT_CONFIGURED);
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (isExistingAccountError(error.code)) {
      return context.redirect("/auth/confirm-email");
    }
    return fail(context, authErrorMessage(error.code));
  }

  return context.redirect("/auth/confirm-email");
};
