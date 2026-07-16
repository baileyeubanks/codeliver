"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { demoAssets } from "@/lib/demo/workspace";

interface AssetIdentity {
  assetId: string;
  projectId: string;
}

interface ReviewRouteError {
  title: string;
  message: string;
  retryable: boolean;
}

interface ReviewRouteFailure {
  requestKey: string;
  error: ReviewRouteError;
}

const INCOMPLETE_ROUTE_ERROR: ReviewRouteError = {
  title: "Review link is incomplete",
  message: "This internal review link does not identify both a project and a media item.",
  retryable: false,
};

const DEMO_ASSET_NOT_FOUND_ERROR: ReviewRouteError = {
  title: "Preview media not found",
  message: "This preview media is not available in the requested project.",
  retryable: false,
};

export function buildCanonicalInternalReviewHref(
  projectId: string,
  assetId: string,
  demoMode = false,
) {
  const demoQuery = demoMode ? "demo=1&" : "";
  return `/projects/${encodeURIComponent(projectId)}?${demoQuery}asset=${encodeURIComponent(assetId)}&view=review`;
}

export function readAuthoritativeAssetIdentity(
  payload: unknown,
  requestedAssetId: string,
): AssetIdentity | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const record = payload as Record<string, unknown>;
  if (
    typeof record.id !== "string"
    || !record.id.trim()
    || record.id !== requestedAssetId
    || typeof record.project_id !== "string"
    || !record.project_id.trim()
  ) {
    return null;
  }

  return { assetId: record.id, projectId: record.project_id };
}

function firstRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function responseError(status: number): ReviewRouteError {
  if (status === 401 || status === 403) {
    return {
      title: "Access could not be verified",
      message: "Your session does not currently allow this media to be opened. Return to the project or sign in again before retrying.",
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      title: "Media not found",
      message: "This media record is no longer available. It may have moved or been removed from the project.",
      retryable: false,
    };
  }

  return {
    title: "Review could not be opened",
    message: "The media service could not verify this review right now. No substitute media was opened.",
    retryable: true,
  };
}

export default function InternalAssetReviewPage() {
  const params = useParams<{ id?: string | string[]; assetId?: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = firstRouteParam(params?.id);
  const assetId = firstRouteParam(params?.assetId);
  const isDemo = searchParams.get("demo") === "1";
  const demoAsset = isDemo
    ? demoAssets.find(
        (candidate) => candidate.id === assetId && candidate.project_id === projectId,
      )
    : undefined;
  const requestKey = `${isDemo ? "demo" : "live"}:${projectId}:${assetId}`;
  const [loadFailure, setLoadFailure] = useState<ReviewRouteFailure | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  const immediateError = !projectId || !assetId
    ? INCOMPLETE_ROUTE_ERROR
    : isDemo && !demoAsset
      ? DEMO_ASSET_NOT_FOUND_ERROR
      : null;
  const loadError = immediateError
    ?? (loadFailure?.requestKey === requestKey ? loadFailure.error : null);

  useEffect(() => {
    if (!loadError) return;
    errorHeadingRef.current?.focus();
  }, [loadError]);

  useEffect(() => {
    if (!projectId || !assetId) return;

    if (isDemo) {
      if (!demoAsset) return;

      router.replace(
        buildCanonicalInternalReviewHref(demoAsset.project_id, demoAsset.id, true),
      );
      return;
    }

    const controller = new AbortController();
    let current = true;

    async function openCanonicalReview() {
      try {
        const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!current) return;
        if (!response.ok) {
          setLoadFailure({ requestKey, error: responseError(response.status) });
          return;
        }

        const payload: unknown = await response.json();
        if (!current) return;

        const identity = readAuthoritativeAssetIdentity(payload, assetId);
        if (!identity) {
          setLoadFailure({
            requestKey,
            error: {
              title: "Review record could not be verified",
              message: "The media service returned an invalid project or media identifier. No review workspace was opened.",
              retryable: true,
            },
          });
          return;
        }

        router.replace(
          buildCanonicalInternalReviewHref(identity.projectId, identity.assetId),
        );
      } catch {
        if (!current || controller.signal.aborted) return;
        setLoadFailure({
          requestKey,
          error: {
            title: "Review could not be opened",
            message: "The media service did not provide a verified record. Check your connection and try again.",
            retryable: true,
          },
        });
      }
    }

    void openCanonicalReview();
    return () => {
      current = false;
      controller.abort();
    };
  }, [assetId, demoAsset, isDemo, projectId, requestKey, retryAttempt, router]);

  const projectsHref = isDemo ? "/projects?demo=1" : "/projects";
  const projectHref = projectId
    ? `/projects/${encodeURIComponent(projectId)}${isDemo ? "?demo=1" : ""}`
    : projectsHref;

  if (!loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] p-6 text-[#18223e]">
        <div role="status" aria-live="polite" className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-7 w-7 animate-spin rounded-full border-2 border-[#d8e0e9] border-t-[#145bb8]"
          />
          <p className="text-sm font-medium">Opening project review...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] p-6 text-[#18223e]">
      <section
        role="alert"
        aria-labelledby="internal-review-error-title"
        className="w-full max-w-xl border-l-4 border-[#c53b32] bg-white px-6 py-7 shadow-sm"
      >
        <AlertCircle aria-hidden="true" className="mb-4 text-[#c53b32]" size={28} />
        <p className="mb-2 text-xs font-semibold uppercase text-[#5c6b7a]">
          Internal review unavailable
        </p>
        <h1
          id="internal-review-error-title"
          ref={errorHeadingRef}
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          {loadError.title}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-[#526171]">{loadError.message}</p>

        <nav aria-label="Review recovery" className="mt-6 flex flex-wrap items-center gap-3">
          {loadError.retryable ? (
            <button
              type="button"
              onClick={() => {
                setLoadFailure(null);
                setRetryAttempt((attempt) => attempt + 1);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#145bb8] px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-[#0f4d9d] focus-visible:ring-2 focus-visible:ring-[#145bb8] focus-visible:ring-offset-2"
            >
              <RefreshCw aria-hidden="true" size={16} />
              Try again
            </button>
          ) : null}
          {projectId ? (
            <Link
              href={projectHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#c8d2dc] bg-white px-4 py-2 text-sm font-semibold text-[#223247] outline-none hover:bg-[#eef3f7] focus-visible:ring-2 focus-visible:ring-[#145bb8] focus-visible:ring-offset-2"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Back to project
            </Link>
          ) : null}
          <Link
            href={projectsHref}
            className="inline-flex min-h-10 items-center px-2 py-2 text-sm font-semibold text-[#145bb8] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#145bb8] focus-visible:ring-offset-2"
          >
            View all projects
          </Link>
        </nav>
      </section>
    </main>
  );
}
