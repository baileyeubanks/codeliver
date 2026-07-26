/**
 * P23 Client Portal — client-safe activity filter.
 *
 * The client feed shows meaningful progress only: a new cut is ready, an
 * approval landed, a deliverable shipped. Internal noise (crew, budget,
 * comments, QC gates, stage bookkeeping, editing decisions) is excluded by
 * an explicit allowlist — unknown actions are dropped, never passed through.
 */

export interface PortalActivityInput {
  id: string;
  action: string;
  actor_name: string;
  details: Record<string, string>;
  created_at: string;
  project_id: string;
  asset_id: string | null;
}

export interface ClientActivityEvent {
  id: string;
  /** Plain-language sentence, e.g. `New cut ready: Denie McDonald_v4`. */
  message: string;
  projectId: string;
  createdAt: string;
}

type ActivityMessage = (details: Record<string, string>) => string | null;

const CLIENT_ACTIVITY_MESSAGES: Record<string, ActivityMessage> = {
  uploaded_new_version: (details) =>
    details.asset_title ? `New cut ready: ${details.asset_title}` : null,
  rendered_sequence: (details) =>
    details.name ? `New cut ready: ${details.name}` : null,
  approved_asset: (details) =>
    details.asset_title ? `Approved: ${details.asset_title}` : null,
  deliverable_delivered: (details) =>
    details.name ? `Delivered: ${details.name}` : null,
};

/** Allowlist of activity actions a client may ever see. */
export const CLIENT_SAFE_ACTIVITY_ACTIONS: readonly string[] = Object.keys(
  CLIENT_ACTIVITY_MESSAGES,
);

export function isClientSafeActivityAction(action: string): boolean {
  return action in CLIENT_ACTIVITY_MESSAGES;
}

/** Filter + rephrase raw workspace activity for the client feed. Input order
 * is preserved (the store keeps newest first); unknown/internal actions and
 * events missing their subject are dropped. */
export function clientSafeActivity(
  items: PortalActivityInput[],
  limit = 12,
): ClientActivityEvent[] {
  const events: ClientActivityEvent[] = [];
  for (const item of items) {
    const toMessage = CLIENT_ACTIVITY_MESSAGES[item.action];
    if (!toMessage) continue;
    const message = toMessage(item.details);
    if (!message) continue;
    events.push({
      id: item.id,
      message,
      projectId: item.project_id,
      createdAt: item.created_at,
    });
    if (events.length >= limit) break;
  }
  return events;
}
