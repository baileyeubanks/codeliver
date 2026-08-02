import { NextRequest, NextResponse } from "next/server";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { normalizeCrmUuid } from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function authorityUnavailable() {
  return json({ error: "CRM inquiry is temporarily unavailable" }, 503);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") {
    return authorityUnavailable();
  }

  let inquiryId: string;
  let teamId: string;
  try {
    inquiryId = normalizeCrmUuid((await params).id, "inquiry_id");
  } catch {
    return json({ error: "Inquiry not found" }, 404);
  }
  try {
    teamId = normalizeCrmUuid(
      request.nextUrl.searchParams.get("team_id"),
      "team_id",
    );
  } catch {
    return json({ error: "team_id is invalid" }, 400);
  }

  const { data, error } = await supabase
    .from("public_inquiries")
    .select(
      "id, team_id, authority_version, contact_name, contact_email, contact_phone, company_name, company_website, project_title, goals, audiences, requested_deliverables, reference_urls, constraints, notes, desired_start_date, due_date, timeline_flexibility, budget_band, submitted_at",
    )
    .eq("id", inquiryId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) return authorityUnavailable();
  if (!data) return json({ error: "Inquiry not found" }, 404);

  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("public_inquiry_uploads")
    .select(
      "id, filename, declared_mime_type, sniffed_mime_type, size_bytes, computed_sha256, upload_state, scan_verdict, attachment_ordinal, bound_at",
    )
    .eq("bound_inquiry_id", inquiryId)
    .eq("team_id", teamId)
    .order("attachment_ordinal", { ascending: true });
  if (attachmentError) return authorityUnavailable();

  return json({
    schemaVersion: "cco.crm.inquiry-detail.v2",
    inquiry: {
      id: data.id,
      teamId: data.team_id,
      authorityVersion: data.authority_version,
      status: "received",
      submittedAt: data.submitted_at,
      contact: {
        name: data.contact_name,
        email: data.contact_email,
        phone: data.contact_phone,
      },
      company: {
        name: data.company_name,
        website: data.company_website,
      },
      project: {
        title: data.project_title,
        goals: data.goals,
        audiences: data.audiences,
        requestedDeliverables: data.requested_deliverables,
        references: data.reference_urls,
        constraints: data.constraints,
        notes: data.notes,
      },
      timeline: {
        desiredStartDate: data.desired_start_date,
        dueDate: data.due_date,
        flexibility: data.timeline_flexibility,
      },
      budgetSignal: {
        source: "client_reported",
        authority: "non_authoritative",
        band: data.budget_band,
      },
      attachments: (attachmentRows ?? []).map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType:
          attachment.sniffed_mime_type ?? attachment.declared_mime_type,
        sizeBytes: attachment.size_bytes,
        contentHash: attachment.computed_sha256
          ? `sha256:${attachment.computed_sha256}`
          : null,
        state: attachment.upload_state,
        scanVerdict: attachment.scan_verdict,
        ordinal: attachment.attachment_ordinal,
        boundAt: attachment.bound_at,
      })),
    },
  });
}
