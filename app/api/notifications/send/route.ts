import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, getBaseUrl } from "@/lib/email";
import type { NotificationType } from "@/lib/types/codeliver";

interface SendPayload {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as SendPayload;
  const { user_id, type, title, body, data } = payload;

  if (!user_id || !type || !title) {
    return NextResponse.json(
      { error: "user_id, type, and title are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Check user preferences for this event type
  const { data: prefRows } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user_id)
    .eq("event_type", type)
    .limit(1);

  const pref = prefRows?.[0];

  // Default: both in-app and email enabled
  const inAppEnabled = pref?.in_app_enabled ?? true;
  const emailEnabled = pref?.email_enabled ?? true;
  const emailFrequency: string = pref?.email_frequency ?? "instant";

  // Insert in-app notification if enabled
  let notificationId: string | null = null;
  if (inAppEnabled) {
    const { data: inserted, error: insertErr } = await supabase
      .from("notifications")
      .insert({
        user_id,
        type,
        title,
        body: body ?? "",
        data: data ?? {},
        read: false,
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    notificationId = inserted?.id ?? null;
  }

  // Send email if enabled and frequency is instant
  let emailSent = false;
  if (emailEnabled && emailFrequency === "instant") {
    // Look up user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user_id)
      .single();

    if (profile?.email) {
      const baseUrl = getBaseUrl();
      const projectId = (data?.project_id as string) ?? "";
      const assetId = (data?.asset_id as string) ?? "";
      const viewUrl =
        projectId && assetId
          ? `${baseUrl}/projects/${projectId}/assets/${assetId}`
          : baseUrl;

      const result = await sendEmail({
        to: profile.email,
        subject: title,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="color: #f1f5f9; font-size: 18px;">${title}</h2>
            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">${body}</p>
            <a href="${viewUrl}"
               style="display: inline-block; margin-top: 16px; padding: 10px 20px;
                      background: #3b82f6; color: #fff; border-radius: 8px;
                      text-decoration: none; font-size: 14px; font-weight: 500;">
              View in CoDeliver
            </a>
          </div>
        `,
      });

      emailSent = result !== null;
    }
  }

  return NextResponse.json({
    ok: true,
    notification_id: notificationId,
    email_sent: emailSent,
  });
}
