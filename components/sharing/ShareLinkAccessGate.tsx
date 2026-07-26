"use client";

import { useEffect, useRef, useState } from "react";
import ShareLinkExpired from "@/components/sharing/ShareLinkExpired";
import SharePasswordGate from "@/components/sharing/SharePasswordGate";
import { resolveShareLinkAccess } from "@/lib/sharing/share-link-access";
import {
  readShareLinkRecord,
  recordShareLinkView,
  type ShareLinkRecord,
} from "@/lib/sharing/share-link-store";

/**
 * Share links 2.0 (P22) — access gate for a review link.
 *
 * One mount point for the coordinator: wrap the review surface with this and
 * the P22 link record (demo, localStorage) decides what renders first —
 * expired notice, password gate, or the review itself. A view receipt is
 * recorded exactly once per mount when the viewer is admitted (open link on
 * load, protected link after a correct password).
 *
 * Renders nothing until the local record has been read, so protected content
 * never flashes before the check.
 */

interface ShareLinkAccessGateProps {
  shareToken: string;
  /** Viewer identity recorded on the view receipt. */
  viewerLabel?: string;
  children: React.ReactNode;
}

export default function ShareLinkAccessGate({
  shareToken,
  viewerLabel = "Anonymous viewer",
  children,
}: ShareLinkAccessGateProps) {
  const [record, setRecord] = useState<ShareLinkRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const receiptRecorded = useRef(false);

  useEffect(() => {
    // Async so the first committed render (null) matches the server render;
    // the gate decides a microtask later — protected content never flashes.
    queueMicrotask(() => {
      setRecord(readShareLinkRecord(shareToken));
      setLoaded(true);
    });
  }, [shareToken]);

  const settings = record?.settings ?? null;
  const access = loaded ? resolveShareLinkAccess(settings, { unlocked }) : null;

  useEffect(() => {
    if (access !== "admitted" || receiptRecorded.current) return;
    receiptRecorded.current = true;
    recordShareLinkView(shareToken, viewerLabel);
  }, [access, shareToken, viewerLabel]);

  if (!loaded || access === null) return null;

  if (access === "expired") {
    return <ShareLinkExpired shareName={settings?.name} expiresAt={settings?.expires_at} />;
  }

  if (access === "password") {
    return (
      <SharePasswordGate
        shareName={settings?.name}
        // Missing hash = tampered record; "" can never verify, so it fails closed.
        passwordHash={settings?.password_hash ?? ""}
        onUnlock={() => setUnlocked(true)}
      />
    );
  }

  return <>{children}</>;
}
