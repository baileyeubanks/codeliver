import { NextResponse } from "next/server";
import { createSupabaseAuth } from "@/lib/supabase-auth";

export async function POST() {
  const supabase = await createSupabaseAuth();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
