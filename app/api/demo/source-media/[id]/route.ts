import { localSourceMedia } from "@/lib/demo/source-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return localSourceMedia(request, (await params).id);
}
export const HEAD = GET;
