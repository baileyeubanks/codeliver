"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  BadgeCheck,
  Bot,
  Cable,
  Code2,
  Cpu,
  Database,
  FileCode2,
  Gauge,
  GitBranch,
  HardDrive,
  KeyRound,
  LockKeyhole,
  MonitorUp,
  Network,
  Plug,
  RadioTower,
  ScreenShare,
  ServerCog,
  ShieldCheck,
  Terminal,
  UploadCloud,
  Webhook,
  Workflow,
} from "lucide-react";
import { useOnlineStatus } from "@/components/navigation/useEnvironmentStatus";
import {
  CO_PRODUCE_CAPABILITY_GROUPS,
  CO_PRODUCE_PERMISSION_CONTRACTS,
  type CoProduceCapability,
  type CoProduceReadiness,
} from "@/lib/co-produce/lifecycle-contract";
import { SettingsSection, StatusBadge, settingsStyles as styles } from "./SettingsFrame";

type SystemsGroup =
  | "All"
  | "Workspace"
  | "Connections"
  | "Processing"
  | "Collaboration"
  | "Automation"
  | "System";

type SystemsStatus = "ready" | "demo" | "dry-run" | "gated" | "planned";

type SystemsTone = "neutral" | "good" | "warn" | "info";

interface SystemsCapability {
  id: string;
  group: Exclude<SystemsGroup, "All">;
  label: string;
  value: string;
  detail: string;
  contract: string;
  permission: string;
  status: SystemsStatus;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  routeHref?: string;
  actionLabel: string;
}

interface SourceOperation {
  id: string;
  capabilityId: string;
  label: string;
  state: "unavailable" | "guarded";
  route: string;
  authority: string;
  requiredContract: string;
  note: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}

interface SystemsQualityMetric {
  label: string;
  value: string;
  status: string;
  detail: string;
  tone: SystemsTone;
  sampled: boolean;
  meter?: number;
}

const SYSTEM_GROUPS: SystemsGroup[] = [
  "All",
  "Workspace",
  "Connections",
  "Processing",
  "Collaboration",
  "Automation",
  "System",
];

const STATUS_LABEL: Record<SystemsStatus, string> = {
  ready: "Ready",
  demo: "Demo",
  "dry-run": "Dry-run",
  gated: "Gated",
  planned: "Planned",
};

const STATUS_TONE: Record<SystemsStatus, SystemsTone> = {
  ready: "good",
  demo: "info",
  "dry-run": "info",
  gated: "warn",
  planned: "neutral",
};

const SYSTEM_CAPABILITIES: SystemsCapability[] = [
  {
    id: "github-repositories",
    group: "Connections",
    label: "GitHub repositories",
    value: "Selected-file import",
    detail: "Copy chosen files at an exact commit into an isolated sandbox; no repository write path is implied.",
    contract: "GitHub App installation, contents:read, commit SHA, path allowlist, secret scan, and import receipt.",
    permission: "integrations:manage",
    status: "planned",
    icon: GitBranch,
    actionLabel: "Connect repo",
  },
  {
    id: "ssh-sftp-remotes",
    group: "Connections",
    label: "SSH / SFTP remotes",
    value: "Host-key pinned",
    detail: "Browse, import, and deliver media through a server adapter without mounting a local share.",
    contract: "Encrypted credential reference, pinned host key, scoped root path, read/write policy, and transfer audit.",
    permission: "storage:manage",
    status: "planned",
    icon: KeyRound,
    actionLabel: "Add remote",
  },
  {
    id: "plugins",
    group: "Connections",
    label: "Plugin marketplace",
    value: "Manifest required",
    detail: "Install analyzers, codecs, exporters, and workflow integrations only after capability review.",
    contract: "Signed manifest, publisher trust, compatibility, declared permissions, isolated runner, rollback audit.",
    permission: "integrations:manage",
    status: "planned",
    icon: Plug,
    actionLabel: "Open plugins",
  },
  {
    id: "ffmpeg-workers",
    group: "Processing",
    label: "FFmpeg media workers",
    value: "Worker credential gated",
    detail: "Worker-backed transcode and analysis require machine credentials; no user-facing worker route is exposed.",
    contract: "Worker identity, token, ffmpeg/ffprobe version, queue lease, cancel/retry policy, storage readiness.",
    permission: "media:write",
    status: "gated",
    icon: Cpu,
    actionLabel: "Machine API only",
  },
  {
    id: "upload-resume",
    group: "Processing",
    label: "Resumable upload lane",
    value: "Version placement",
    detail: "Immediate upload progress, resumable recovery, errors, completion, and new-version placement.",
    contract: "Tus session, storage adapter, asset version record, upload receipt, failure state, and retry audit.",
    permission: "media:write",
    status: "gated",
    icon: UploadCloud,
    routeHref: "/api/health/dependencies",
    actionLabel: "Check storage",
  },
  {
    id: "ai-cleanup",
    group: "Processing",
    label: "Transcript and AI cleanup",
    value: "Suggestion-only",
    detail: "Surface uh/um, long silence, pause, and cleanup suggestions without pretending processing is complete.",
    contract: "Transcript job state, confidence spans, suggestion receipts, accept/reject audit, and model provenance.",
    permission: "postproduction:write",
    status: "demo",
    icon: FileCode2,
    actionLabel: "Review suggestions",
  },
  {
    id: "live-presence",
    group: "Collaboration",
    label: "Live collaborators",
    value: "Roster now, presence gated",
    detail: "Show who is actually in the project, syncing cursors, comments, review events, and reconnect state.",
    contract: "Authenticated project channels, RLS, presence state, broadcast event allowlist, reconnect limits.",
    permission: "reviews:comment",
    status: "gated",
    icon: RadioTower,
    routeHref: "/api/health/ready",
    actionLabel: "Check realtime",
  },
  {
    id: "screen-share",
    group: "Collaboration",
    label: "Screen share edit session",
    value: "Explicit consent",
    detail: "Share an editor screen for review, discussion, and handoff without granting remote control by default.",
    contract: "User-triggered display capture, WebRTC signaling, TURN, revoke controls, roles, and consent audit.",
    permission: "reviews:comment",
    status: "planned",
    icon: ScreenShare,
    actionLabel: "Start session",
  },
  {
    id: "connection-quality",
    group: "Collaboration",
    label: "Connection quality gauge",
    value: "Binary online ready",
    detail: "Warn before uploads, playback, or live review becomes unreliable.",
    contract: "Rolling backend RTT, upload probe, WebRTC RTT, jitter, packet loss, and clear threshold labels.",
    permission: "activity:read",
    status: "planned",
    icon: Gauge,
    actionLabel: "Run probe",
  },
  {
    id: "browser-capture",
    group: "Collaboration",
    label: "Browser and screen capture",
    value: "Capture permission",
    detail: "Capture a tab, window, or screen for references, review evidence, or media intake.",
    contract: "Secure-context display capture, source selection, stop/revoke control, upload policy, retention record.",
    permission: "media:write",
    status: "planned",
    icon: MonitorUp,
    actionLabel: "Choose source",
  },
  {
    id: "automation-hooks",
    group: "Automation",
    label: "Automation hooks",
    value: "Signed delivery",
    detail: "Send lifecycle events to approved endpoints and inspect delivery history.",
    contract: "HTTPS endpoint, encrypted secret, HMAC timestamp, SSRF guard, idempotency, retries, dead-letter log.",
    permission: "integrations:manage",
    status: "gated",
    icon: Webhook,
    routeHref: "/api/health/dependencies",
    actionLabel: "Check hooks",
  },
  {
    id: "agent-runs",
    group: "Automation",
    label: "Agent proposal runs",
    value: "Deny-all execution",
    detail: "Plan agent work, review proposed output, and require human approval before any mutation authority.",
    contract: "Proposal-only run, denied network/filesystem/secrets by default, usage reservation, approval receipt.",
    permission: "agents:propose",
    status: "dry-run",
    icon: Bot,
    actionLabel: "Open proposals",
  },
  {
    id: "worktrees",
    group: "Automation",
    label: "Environments and worktrees",
    value: "Isolated experiments",
    detail: "Prepare branch, base SHA, sandbox limits, environment, and diff receipts before code/media changes.",
    contract: "Repo SHA, worktree lock, OCI image, resource limits, TTL, cleanup approval, and diff attestation.",
    permission: "agents:approve",
    status: "planned",
    icon: Terminal,
    actionLabel: "Create worktree",
  },
  {
    id: "permissions",
    group: "Workspace",
    label: "Permission authority",
    value: "No full-access toggle",
    detail: "Human roles and tool scopes stay separate across media, repo, network, secrets, screen, and sends.",
    contract: "Workspace RBAC, review invite permission, one-time/session grants, persistent grants, sanitized audit.",
    permission: "workspace:manage",
    status: "demo",
    icon: ShieldCheck,
    actionLabel: "Review policy",
  },
  {
    id: "notifications",
    group: "Workspace",
    label: "Notification authority",
    value: "Provider-aware",
    detail: "Configure in-app, email, text, and iMessage without implying delivery when providers are absent.",
    contract: "Consent, provider readiness, channel preferences, idempotency, suppression, delivery receipts.",
    permission: "workspace:manage",
    status: "demo",
    icon: Activity,
    routeHref: "/settings?section=notifications&demo=1",
    actionLabel: "Open settings",
  },
  {
    id: "health",
    group: "System",
    label: "System readiness",
    value: "Live probes",
    detail: "Expose frontend, data, storage, workers, providers, timestamps, and release state truthfully.",
    contract: "Liveness, readiness, dependency probes, required/optional checks, latency, and last-known state.",
    permission: "activity:read",
    status: "ready",
    icon: ServerCog,
    routeHref: "/api/health/dependencies",
    actionLabel: "Open probes",
  },
];

const SOURCE_STATE_LABEL: Record<SourceOperation["state"], string> = {
  unavailable: "Unavailable",
  guarded: "Guarded; unverified",
};

const SOURCE_STATE_TONE: Record<SourceOperation["state"], SystemsTone> = {
  unavailable: "neutral",
  guarded: "warn",
};

function sourceCapability(capabilityId: string) {
  const capability = SYSTEM_CAPABILITIES.find((item) => item.id === capabilityId);
  if (!capability) {
    throw new Error(`Missing systems capability for source operation: ${capabilityId}`);
  }
  return capability;
}

const SOURCE_OPERATION_CONTRACTS = [
  {
    id: "repo-import",
    capabilityId: "github-repositories",
    label: "GitHub selected-file import",
    state: "unavailable",
    route: "No product route",
    authority: "Planned: integrations:manage",
    requiredContract: "contents:read, pinned commit SHA, path allowlist, secret scan, import receipt",
    note: "No clone, branch, commit, push, or repository write authority.",
  },
  {
    id: "remote-media",
    capabilityId: "ssh-sftp-remotes",
    label: "SSH / SFTP media remote",
    state: "unavailable",
    route: "No product route",
    authority: "Planned: integrations:manage + storage:manage",
    requiredContract: "encrypted credential reference, pinned host key, scoped root, explicit read/write policy, transfer receipt",
    note: "No remote is connected or browsable from this UI.",
  },
  {
    id: "plugin-gate",
    capabilityId: "plugins",
    label: "Plugin manifest review",
    state: "unavailable",
    route: "No install route",
    authority: "Planned: integrations:manage",
    requiredContract: "signed manifest, publisher trust, compatibility, declared permissions, isolated runner, rollback receipt",
    note: "No plugin is installed, loaded, or executable from this UI.",
  },
  {
    id: "worktree-sandbox",
    capabilityId: "worktrees",
    label: "Isolated worktree",
    state: "unavailable",
    route: "No product route",
    authority: "Not modeled",
    requiredContract: "repository and base SHA, worktree lock, sandbox limits, TTL, cleanup approval, diff attestation",
    note: "Operator-managed outside Webster; no shell or command execution is exposed.",
  },
  {
    id: "worker-handoff",
    capabilityId: "ffmpeg-workers",
    label: "FFmpeg worker handoff",
    state: "guarded",
    route: "Machine API only; no user route",
    authority: "media:write + worker token",
    requiredContract: "worker identity, FFmpeg/FFprobe versions, queue lease, storage readiness, retry/cancel audit",
    note: "This panel does not prove that a worker is online or ready.",
  },
] as const;

const SOURCE_OPERATIONS: SourceOperation[] = SOURCE_OPERATION_CONTRACTS.map((operation) => ({
  ...operation,
  icon: sourceCapability(operation.capabilityId).icon,
}));

function statusText(status: SystemsStatus, demoMode: boolean) {
  if (status === "demo" && !demoMode) return "Managed";
  return STATUS_LABEL[status];
}

function statusTone(status: SystemsStatus): SystemsTone {
  return STATUS_TONE[status];
}

function permissionDetail(permission: string) {
  return CO_PRODUCE_PERMISSION_CONTRACTS[
    permission as keyof typeof CO_PRODUCE_PERMISSION_CONTRACTS
  ]?.description ?? "Contract pending";
}

export default function StudioSystemsSettings({
  demoMode,
  onNotice,
}: {
  demoMode: boolean;
  onNotice: (message: string) => void;
}) {
  const online = useOnlineStatus();
  const [activeSystemsGroup, setActiveSystemsGroup] = useState<SystemsGroup>("All");

  const readiness = useMemo(() => {
    const capabilities = CO_PRODUCE_CAPABILITY_GROUPS.reduce<CoProduceCapability[]>(
      (items, group) => {
        items.push(...(group.capabilities as readonly CoProduceCapability[]));
        return items;
      },
      [],
    );
    const stateSeed: Record<CoProduceReadiness["state"], number> = {
      operational: 0,
      "read-only": 0,
      guarded: 0,
      unavailable: 0,
    };
    const stateCounts = capabilities.reduce(
      (counts, capability) => {
        counts[capability.readiness.state] += 1;
        return counts;
      },
      stateSeed,
    );
    const permissionSeed: Record<"enforced" | "planned", number> = {
      enforced: 0,
      planned: 0,
    };
    const permissionCounts = Object.values(CO_PRODUCE_PERMISSION_CONTRACTS).reduce(
      (counts, contract) => {
        counts[contract.state] += 1;
        return counts;
      },
      permissionSeed,
    );

    return {
      capabilityTotal: capabilities.length,
      stateCounts,
      permissionCounts,
    };
  }, []);

  const visibleCapabilities = SYSTEM_CAPABILITIES.filter(
    (capability) => activeSystemsGroup === "All" || capability.group === activeSystemsGroup,
  );

  const readinessCards = [
    {
      label: "Lifecycle contract",
      value: `${readiness.capabilityTotal} surfaces`,
      detail: `${readiness.stateCounts.operational} operational, ${readiness.stateCounts.guarded} guarded`,
      icon: Workflow,
      tone: "info" as const,
    },
    {
      label: "Permission model",
      value: `${readiness.permissionCounts.enforced} enforced`,
      detail: `${readiness.permissionCounts.planned} planned extension grants`,
      icon: LockKeyhole,
      tone: "good" as const,
    },
    {
      label: "Network state",
      value: online ? "Online" : "Offline",
      detail: "Browser signal only; quality probes are planned",
      icon: Network,
      tone: online ? "good" as const : "warn" as const,
    },
    {
      label: "Backend posture",
      value: "Probe required",
      detail: "Use readiness links before claiming production health",
      icon: Database,
      tone: "warn" as const,
    },
  ];

  const qualityMetrics: SystemsQualityMetric[] = [
    {
      label: "Browser online",
      value: online ? "Online" : "Offline",
      status: "Browser signal",
      detail: "Connectivity only; no throughput or latency sample.",
      tone: online ? "good" as const : "warn" as const,
      sampled: false,
    },
    {
      label: "Upload probe",
      value: "Not measured",
      status: "Planned",
      detail: "Resumable upload throughput probe is not wired.",
      tone: "neutral" as const,
      sampled: false,
    },
    {
      label: "WebRTC RTT",
      value: "Not measured",
      status: "Planned",
      detail: "Live review RTT and jitter probes need a media session.",
      tone: "neutral" as const,
      sampled: false,
    },
    {
      label: "Packet loss",
      value: "Not measured",
      status: "Planned",
      detail: "Packet loss remains a planned threshold, not a sample.",
      tone: "neutral" as const,
      sampled: false,
    },
  ];

  return (
    <div className={styles.panel}>
      <SettingsSection
        title="Studio systems"
        detail="Dense production infrastructure controls for Webster. Planned capabilities stay disabled until their backend contract, permission, and audit path exist."
        action={
          <StatusBadge tone={demoMode ? "info" : "warn"}>
            {demoMode ? "Demo controls" : "Managed service"}
          </StatusBadge>
        }
      >
        <div className={styles.systemsReadinessStrip} aria-label="Studio systems readiness">
          {readinessCards.map((item) => {
            const Icon = item.icon;
            return (
              <article className={styles.systemsReadinessItem} key={item.label}>
                <span className={`${styles.systemsReadinessIcon} ${styles[`systemsTone${item.tone}`]}`} aria-hidden="true">
                  <Icon size={15} />
                </span>
                <span className={styles.systemsReadinessCopy}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.detail}</small>
                </span>
              </article>
            );
          })}
        </div>

        <div className={styles.systemsCommandBar}>
          <div className={styles.segment} aria-label="Studio systems filter">
            {SYSTEM_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={activeSystemsGroup === group}
                onClick={() => setActiveSystemsGroup(group)}
              >
                {group}
              </button>
            ))}
          </div>
          <a className={styles.systemsHealthLink} href="/api/health/ready">
            <BadgeCheck size={14} aria-hidden="true" /> Health check
          </a>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Source operations"
        detail="Current route, authority, and contract state for external source intake. Four routes are unavailable; FFmpeg worker readiness is not verified."
        action={<StatusBadge tone="neutral">Read-only</StatusBadge>}
      >
        <div className={styles.systemsSourceOps} aria-label="Source operations contract state">
          {SOURCE_OPERATIONS.map((operation) => {
            const Icon = operation.icon;
            return (
              <article
                className={styles.systemsSourceStep}
                data-state={operation.state}
                key={operation.id}
              >
                <span className={styles.systemsSourceIcon} aria-hidden="true">
                  <Icon size={15} />
                </span>
                <div className={styles.systemsSourceCopy}>
                  <strong>{operation.label}</strong>
                  <small>{operation.note}</small>
                </div>
                <div className={styles.systemsSourceState}>
                  <StatusBadge tone={SOURCE_STATE_TONE[operation.state]}>
                    {SOURCE_STATE_LABEL[operation.state]}
                  </StatusBadge>
                  <span>{operation.route}</span>
                </div>
                <div className={styles.systemsSourceAuthority}>
                  <strong>Authority</strong>
                  <span>{operation.authority}</span>
                </div>
                <div className={styles.systemsSourceContract}>
                  <strong>Required contract</strong>
                  <small>{operation.requiredContract}</small>
                </div>
              </article>
            );
          })}
        </div>
        <div className={styles.systemsSourceGuard}>
          <span>
            <ShieldCheck size={13} aria-hidden="true" /> No repo write path
          </span>
          <span>
            <LockKeyhole size={13} aria-hidden="true" /> No secret access by default
          </span>
          <span>
            <Database size={13} aria-hidden="true" /> Worker readiness still required
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Capability matrix"
        detail="Each row maps to a route, local state, permission, or explicit backend gate. Disabled rows are intentionally not pretending to work."
      >
        <div className={styles.systemsCapabilityList}>
          {visibleCapabilities.map((capability) => {
            const Icon = capability.icon;
            const disabled = capability.status === "planned" || capability.id === "ffmpeg-workers";
            return (
              <article className={styles.systemsCapabilityRow} key={capability.id}>
                <span className={styles.systemsCapabilityIcon} aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div className={styles.systemsCapabilityCopy}>
                  <span className={styles.systemsCapabilityGroup}>{capability.group}</span>
                  <strong>{capability.label}</strong>
                  <small>{capability.detail}</small>
                </div>
                <div className={styles.systemsCapabilityStatus}>
                  <StatusBadge tone={statusTone(capability.status)}>
                    {statusText(capability.status, demoMode)}
                  </StatusBadge>
                  <span>{capability.value}</span>
                </div>
                <div className={styles.systemsCapabilityContract}>
                  <strong>{capability.permission}</strong>
                  <span>{permissionDetail(capability.permission)}</span>
                  <small>{capability.contract}</small>
                </div>
                {capability.routeHref ? (
                  <a className={styles.systemsRowAction} href={capability.routeHref}>
                    {capability.actionLabel}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={styles.systemsRowAction}
                    disabled={disabled}
                    onClick={() =>
                      onNotice(`${capability.label} is ${STATUS_LABEL[capability.status].toLowerCase()}`)
                    }
                  >
                    {capability.actionLabel}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Network quality"
        detail="The current release can observe browser online/offline state. Upload throughput, RTT, jitter, and packet-loss probes are shown as planned thresholds until telemetry exists."
        action={<StatusBadge tone={online ? "good" : "warn"}>{online ? "Browser online" : "Offline"}</StatusBadge>}
      >
        <div className={styles.systemsQualityGrid}>
          {qualityMetrics.map((metric) => (
            <article className={styles.systemsQualityMetric} key={metric.label}>
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
              <StatusBadge tone={metric.tone}>{metric.status}</StatusBadge>
              {metric.sampled && typeof metric.meter === "number" ? (
                <meter min={0} max={100} value={metric.meter} aria-label={`${metric.label} readiness`} />
              ) : (
                <small className={styles.systemsQualityPending}>{metric.detail}</small>
              )}
            </article>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="System proof"
        detail="Production readiness is not inferred from visible UI. Operators must verify live probes, worker credentials, storage transport, and provider configuration before enabling external actions."
      >
        <div className={styles.systemsProofGrid}>
          <a href="/api/health/live">
            <ServerCog size={15} aria-hidden="true" />
            <strong>Live</strong>
            <span>Frontend route responds</span>
          </a>
          <a href="/api/health/ready">
            <Database size={15} aria-hidden="true" />
            <strong>Ready</strong>
            <span>Data and storage dependencies</span>
          </a>
          <a href="/api/health/dependencies">
            <HardDrive size={15} aria-hidden="true" />
            <strong>Dependencies</strong>
            <span>Provider and transport checks</span>
          </a>
          <a href="/settings?section=notifications&demo=1">
            <Cable size={15} aria-hidden="true" />
            <strong>Channels</strong>
            <span>Notification provider authority</span>
          </a>
          <a href="/settings?section=brand&demo=1">
            <Code2 size={15} aria-hidden="true" />
            <strong>Brand</strong>
            <span>Product identity and client shell</span>
          </a>
        </div>
      </SettingsSection>
    </div>
  );
}
