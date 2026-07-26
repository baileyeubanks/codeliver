import { apiJson } from "@/lib/api/responses";

export const VERSION_UPLOAD_RETIRED = {
  error:
    "New version uploads are unavailable until receipt-bound version ingest is implemented.",
  code: "VERSION_UPLOAD_RETIRED",
} as const;

export function versionUploadRetiredResponse() {
  return apiJson(VERSION_UPLOAD_RETIRED, {
    status: 410,
    headers: {
      Deprecation: "true",
    },
  });
}
