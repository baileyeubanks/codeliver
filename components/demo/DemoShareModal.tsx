"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  Mail,
  MessageSquare,
  MessagesSquare,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import type { MediaAsset } from "@/components/projects/MediaCard";
import {
  type CreateDemoShareInput,
  type DemoShareLink,
  type DemoShareNotificationChannel,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import {
  SHARE_INTENTS,
  getShareIntentDefinition,
  resolveShareIntentDefaults,
  type ShareIntent,
} from "@/lib/sharing/share-intent";
import { toDemoSiteUrl } from "@/lib/surface-origins";

interface DemoShareModalProps {
  assets: MediaAsset[];
  initialSelectedAssetIds?: string[];
  onClose: () => void;
  onShared: (input: CreateDemoShareInput) => DemoShareLink[];
}

type IconComponent = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

const INTENT_ICONS: Record<ShareIntent, IconComponent> = {
  internal_review: Users,
  client_review: MessageSquare,
  approval_needed: ShieldCheck,
  final_delivery: Download,
};

function formatExpiryInput(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function channelLabel(channel: DemoShareNotificationChannel) {
  if (channel === "imessage") return "iMessage";
  return channel === "sms" ? "Text" : "Email";
}

function resolveDemoLink(destination: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return toDemoSiteUrl(destination, window.location.origin);
  } catch {
    return null;
  }
}

export default function DemoShareModal({
  assets,
  initialSelectedAssetIds,
  onClose,
  onShared,
}: DemoShareModalProps) {
  const workspace = useDemoWorkspace();
  const initialIds = useMemo(
    () =>
      initialSelectedAssetIds?.length
        ? initialSelectedAssetIds.filter((id) => assets.some((asset) => asset.id === id))
        : assets[0]
          ? [assets[0].id]
          : [],
    [assets, initialSelectedAssetIds],
  );
  const initialDefaults = resolveShareIntentDefaults("client_review");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialIds));
  const [shareIntent, setShareIntent] = useState<ShareIntent>("client_review");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [requireName, setRequireName] = useState(true);
  const [allowDownload, setAllowDownload] = useState(initialDefaults.downloadEnabled);
  const [watermark, setWatermark] = useState(initialDefaults.watermarkEnabled);
  const [expiresAt, setExpiresAt] = useState(() => formatExpiryInput(initialDefaults.expiresInDays));
  const [maxViews, setMaxViews] = useState("");
  const [channels, setChannels] = useState<Set<DemoShareNotificationChannel>>(new Set());
  const [createdLinks, setCreatedLinks] = useState<DemoShareLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const intentDefinition = getShareIntentDefinition(shareIntent);
  const intentDefaults = resolveShareIntentDefaults(shareIntent);
  const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));
  const allSelected = assets.length > 0 && selectedAssets.length === assets.length;
  const notificationSettings = workspace.settings.notifications;

  const notificationOptions: Array<{
    id: DemoShareNotificationChannel;
    label: string;
    detail: string;
    icon: IconComponent;
    available: boolean;
  }> = [
    {
      id: "email",
      label: "Email",
      detail: notificationSettings.email.enabled
        ? "Recorded as a preview delivery"
        : "Disabled in notification settings",
      icon: Mail,
      available: notificationSettings.email.enabled,
    },
    {
      id: "sms",
      label: "Text message",
      detail:
        notificationSettings.sms.enabled && notificationSettings.sms.phone
          ? notificationSettings.sms.phone
          : "Add and enable a number in settings",
      icon: Smartphone,
      available: Boolean(notificationSettings.sms.enabled && notificationSettings.sms.phone),
    },
    {
      id: "imessage",
      label: "M2 iMessage relay",
      detail:
        notificationSettings.imessage.status === "dry_run"
          ? "Dry run - logged locally"
          : "Enable dry run in settings",
      icon: MessagesSquare,
      available:
        notificationSettings.imessage.enabled &&
        notificationSettings.imessage.status === "dry_run",
    },
  ];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function selectIntent(intent: ShareIntent) {
    const defaults = resolveShareIntentDefaults(intent);
    setShareIntent(intent);
    setAllowDownload(defaults.downloadEnabled);
    setWatermark(defaults.watermarkEnabled);
    setExpiresAt(formatExpiryInput(defaults.expiresInDays));
    setError("");
  }

  function toggleAsset(assetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
    setError("");
  }

  function toggleChannel(channel: DemoShareNotificationChannel) {
    setChannels((current) => {
      const next = new Set(current);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
    setError("");
  }

  function submitShare() {
    if (selectedIds.size === 0) {
      setError("Select at least one deliverable.");
      return;
    }
    if (intentDefaults.requiresReviewerEmail && !reviewerEmail.trim()) {
      setError("Approval handoffs require a reviewer email.");
      return;
    }
    if (channels.size > 0 && !reviewerEmail.trim()) {
      setError("Add a reviewer email before recording a delivery plan.");
      return;
    }

    const parsedMaxViews = Number.parseInt(maxViews, 10);
    const links = onShared({
      assetIds: Array.from(selectedIds),
      reviewerName,
      reviewerEmail,
      shareIntent,
      requireName,
      allowDownloads: allowDownload,
      watermarkEnabled: watermark,
      expiresAt: expiresAt ? `${expiresAt}T23:59:59.999Z` : null,
      maxViews: Number.isFinite(parsedMaxViews) && parsedMaxViews > 0 ? parsedMaxViews : null,
      notificationChannels: Array.from(channels),
    });
    setCreatedLinks(links);
  }

  async function copyLink(link: DemoShareLink) {
    const publicUrl = resolveDemoLink(link.public_url);
    if (!publicUrl) {
      setError("The local demo link could not be created safely.");
      return;
    }

    await navigator.clipboard.writeText(publicUrl);
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  async function copyAllLinks() {
    const copy = createdLinks
      .flatMap((link) => {
        const publicUrl = resolveDemoLink(link.public_url);
        if (!publicUrl) return [];
        const asset = assets.find((candidate) => candidate.id === link.asset_ids[0]);
        return [`${asset?.title ?? "Deliverable"}: ${publicUrl}`];
      })
      .join("\n");
    if (!copy) {
      setError("The local demo links could not be created safely.");
      return;
    }
    await navigator.clipboard.writeText(copy);
    setCopiedId("all");
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="modal-overlay demo-share-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="modal demo-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-share-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="demo-share-header">
          <div>
            <p className="demo-eyebrow">Permissioned handoff</p>
            <h2 id="demo-share-title">
              {createdLinks.length > 0
                ? `${createdLinks.length} ${createdLinks.length === 1 ? "link" : "links"} ready`
                : "Share project media"}
            </h2>
            <p>
              {createdLinks.length > 0
                ? "Each deliverable has its own revocable review link."
                : "Choose the media, recipient experience, and delivery authority."}
            </p>
          </div>
          <button className="demo-share-icon-button" type="button" onClick={onClose} title="Close" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {createdLinks.length > 0 ? (
          <div className="demo-share-success">
            <div className="demo-share-success-summary">
              <span><CheckCircle2 size={20} /></span>
              <div>
                <strong>{intentDefinition.label}</strong>
                <p>
                  {channels.size > 0
                    ? `${Array.from(channels).map(channelLabel).join(", ")} recorded as a dry run. No external message was sent.`
                    : "Links created only. No external message was sent."}
                </p>
              </div>
              {createdLinks.length > 1 ? (
                <button type="button" className="demo-share-copy-all" onClick={copyAllLinks}>
                  {copiedId === "all" ? <Check size={15} /> : <Copy size={15} />}
                  {copiedId === "all" ? "Copied" : "Copy all"}
                </button>
              ) : null}
            </div>

            {error ? <p className="demo-share-error" role="alert">{error}</p> : null}

            <div className="demo-share-created-list">
              {createdLinks.map((link) => {
                const asset = assets.find((candidate) => candidate.id === link.asset_ids[0]);
                const publicUrl = resolveDemoLink(link.public_url);
                return (
                  <article key={link.id}>
                    <Image
                      src={asset?.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"}
                      alt=""
                      width={72}
                      height={42}
                      unoptimized
                    />
                    <div>
                      <strong>{asset?.title ?? "Deliverable"}</strong>
                      <span>{publicUrl ?? "Link unavailable"}</span>
                    </div>
                    {publicUrl ? (
                      <>
                        <button type="button" onClick={() => copyLink(link)} title="Copy link" aria-label={`Copy link for ${asset?.title ?? "deliverable"}`}>
                          {copiedId === link.id ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        <a href={publicUrl} target="_blank" rel="noreferrer" title="Open review" aria-label={`Open review for ${asset?.title ?? "deliverable"}`}>
                          <ExternalLink size={16} />
                        </a>
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <footer className="demo-share-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCreatedLinks([])}>
                <Link2 size={15} /> Create more
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            </footer>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitShare();
            }}
          >
            <div className="demo-share-workspace">
              <section className="demo-share-assets" aria-labelledby="demo-share-assets-title">
                <div className="demo-share-section-heading">
                  <div>
                    <span>1</span>
                    <div>
                      <h3 id="demo-share-assets-title">Deliverables</h3>
                      <p>{selectedAssets.length} of {assets.length} selected</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(allSelected ? new Set() : new Set(assets.map((asset) => asset.id)))}
                  >
                    {allSelected ? "Clear" : "Select all"}
                  </button>
                </div>

                <div className="demo-share-asset-list">
                  {assets.map((asset) => (
                    <label key={asset.id} className={selectedIds.has(asset.id) ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        onChange={() => toggleAsset(asset.id)}
                        aria-label={`Share ${asset.title}`}
                      />
                      <Image
                        src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"}
                        alt=""
                        width={64}
                        height={38}
                        unoptimized
                      />
                      <span>
                        <strong>{asset.title}</strong>
                        <small>Version {asset.version_count ?? 1}</small>
                      </span>
                      <em>{formatStatus(asset.status)}</em>
                    </label>
                  ))}
                </div>
              </section>

              <div className="demo-share-config">
                <section aria-labelledby="demo-share-intent-title">
                  <div className="demo-share-section-heading">
                    <div>
                      <span>2</span>
                      <div>
                        <h3 id="demo-share-intent-title">Handoff</h3>
                        <p>{intentDefinition.permissionsLabel}</p>
                      </div>
                    </div>
                  </div>

                  <div className="demo-share-intents" role="radiogroup" aria-label="Handoff intent">
                    {SHARE_INTENTS.map((intent) => {
                      const IntentIcon = INTENT_ICONS[intent.value];
                      const selected = intent.value === shareIntent;
                      return (
                        <button
                          key={intent.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={selected ? "selected" : ""}
                          onClick={() => selectIntent(intent.value)}
                        >
                          <IntentIcon size={16} aria-hidden />
                          <span><strong>{intent.label}</strong><small>{intent.nextStepLabel}</small></span>
                          {selected ? <Check size={15} aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="demo-share-recipient-grid">
                    <label>
                      <span>Reviewer name</span>
                      <input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Optional" />
                    </label>
                    <label>
                      <span>Reviewer email{intentDefaults.requiresReviewerEmail ? " *" : ""}</span>
                      <input
                        type="email"
                        value={reviewerEmail}
                        onChange={(event) => setReviewerEmail(event.target.value)}
                        placeholder="reviewer@client.com"
                        required={intentDefaults.requiresReviewerEmail}
                      />
                    </label>
                    <label>
                      <span>Expiration</span>
                      <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                    </label>
                    <label>
                      <span>View limit</span>
                      <input type="number" min="1" value={maxViews} onChange={(event) => setMaxViews(event.target.value)} placeholder="Unlimited" />
                    </label>
                  </div>

                  <div className="demo-share-permissions">
                    <label>
                      <input type="checkbox" checked={requireName} onChange={(event) => setRequireName(event.target.checked)} />
                      <span><strong>Identify reviewers</strong><small>Require a name before feedback.</small></span>
                    </label>
                    <label>
                      <input type="checkbox" checked={watermark} onChange={(event) => setWatermark(event.target.checked)} />
                      <span><strong>Watermark</strong><small>Overlay recipient identity.</small></span>
                    </label>
                    <label>
                      <input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} />
                      <span><strong>Allow download</strong><small>Expose the delivery file.</small></span>
                    </label>
                  </div>
                </section>

                <section aria-labelledby="demo-share-delivery-title">
                  <div className="demo-share-section-heading">
                    <div>
                      <span>3</span>
                      <div>
                        <h3 id="demo-share-delivery-title">Notify</h3>
                        <p>{channels.size === 0 ? "Links only" : "Local dry run"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="demo-share-channels">
                    {notificationOptions.map((option) => {
                      const ChannelIcon = option.icon;
                      return (
                        <label key={option.id} className={!option.available ? "disabled" : ""}>
                          <ChannelIcon size={16} aria-hidden />
                          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                          <input
                            type="checkbox"
                            checked={channels.has(option.id)}
                            disabled={!option.available}
                            onChange={() => toggleChannel(option.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="demo-share-authority">
                    <ShieldCheck size={15} /> Local preview never sends externally. Selected channels are stored as a delivery plan only.
                  </p>
                </section>
              </div>
            </div>

            {error ? <p className="demo-share-error" role="alert">{error}</p> : null}

            <footer className="demo-share-footer">
              <div>
                <Eye size={15} />
                <span>{selectedAssets.length} {selectedAssets.length === 1 ? "link" : "links"} · {intentDefinition.shortLabel}</span>
              </div>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={selectedIds.size === 0}>
                <Link2 size={15} /> Create {selectedAssets.length || ""} {selectedAssets.length === 1 ? "link" : "links"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
