import { NextResponse } from "next/server";
import { createSupabaseAuth } from "@/lib/supabase-auth";

export async function POST() {
  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json(
        { success: false, error: "Sign out could not be completed" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Sign out could not be completed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
