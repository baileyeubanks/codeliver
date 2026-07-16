import { NextResponse } from "next/server";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localMeteringActor,
  scopeFromSearchParams,
} from "@/lib/vault/http";

export async function GET(request: Request) {
  try {
    const scope = scopeFromSearchParams(new URL(request.url).searchParams);
    const { metering } = await getLocalControlPlane(scope);
    const audit = await metering.exportAudit(scope, localMeteringActor(request));
    return new NextResponse(audit.jsonl, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="${audit.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Hash": audit.sha256,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
