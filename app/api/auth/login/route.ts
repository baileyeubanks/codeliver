import { NextResponse } from "next/server";
import { createSupabaseAuth } from "@/lib/supabase-auth";

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    // Fallback to form data for non-JSON requests
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const supabase = await createSupabaseAuth();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
