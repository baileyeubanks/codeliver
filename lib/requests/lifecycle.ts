/* P27: Request Center — lifecycle state machine.                            */
/* submitted → triaged → accepted | declined → in_progress → delivered →     */
/* closed. Declined is terminal and requires a note. Pure guards only; the   */
/* store applies them to persisted records.                                  */

export const REQUEST_STATUSES = [
  "submitted",
  "triaged",
  "accepted",
  "declined",
  "in_progress",
  "delivered",
  "closed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  triaged: "Triaged",
  accepted: "Accepted",
  declined: "Declined",
  in_progress: "In progress",
  delivered: "Delivered",
  closed: "Closed",
};

export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  submitted: ["triaged"],
  triaged: ["accepted", "declined"],
  accepted: ["in_progress"],
  declined: [],
  in_progress: ["delivered"],
  delivered: ["closed"],
  closed: [],
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return (REQUEST_TRANSITIONS[from] as readonly RequestStatus[]).includes(to);
}

export interface RequestLifecycleSubject {
  status: RequestStatus;
  decline_note: string | null;
}

export type RequestTransitionResult<T extends RequestLifecycleSubject> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/** Apply a lifecycle transition to any record carrying a status. Declining
 * requires a non-empty note, which is recorded on the record. */
export function transitionRequestStatus<T extends RequestLifecycleSubject>(
  request: T,
  to: RequestStatus,
  opts: { note?: string } = {},
): RequestTransitionResult<T> {
  if (!canTransitionRequest(request.status, to)) {
    return {
      ok: false,
      reason: `A ${request.status} request cannot move to ${to}.`,
    };
  }
  if (to === "declined") {
    const note = opts.note?.trim() ?? "";
    if (!note) {
      return { ok: false, reason: "Declining a request requires a note for the client." };
    }
    return { ok: true, value: { ...request, status: to, decline_note: note } };
  }
  return { ok: true, value: { ...request, status: to } };
}
