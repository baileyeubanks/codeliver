import type { SharePermission } from "@/lib/types/codeliver";

export type ShareIntent =
  | "internal_review"
  | "client_review"
  | "approval_needed"
  | "final_delivery";

interface ShareIntentDefinition {
  value: ShareIntent;
  label: string;
  shortLabel: string;
  dashboardTitle: string;
  dashboardDescription: string;
  recipientTitle: string;
  recipientDescription: string;
  nextStepLabel: string;
  nextStepDescription: string;
  permissionsLabel: string;
  defaults: {
    permissions: SharePermission;
    watermarkEnabled: boolean;
    downloadEnabled: boolean;
    expiresInDays: number;
    requiresReviewerEmail: boolean;
  };
}

type ShareIntentInput = {
  permissions: SharePermission;
  downloadEnabled?: boolean | null;
  watermarkEnabled?: boolean | null;
};

export const SHARE_INTENT_DEFINITIONS: Record<ShareIntent, ShareIntentDefinition> = {
  internal_review: {
    value: "internal_review",
    label: "Internal review",
    shortLabel: "Internal",
    dashboardTitle: "Keep working feedback separate from client handoff",
    dashboardDescription:
      "Use this when the cut still needs internal notes, frame-specific direction, or stakeholder alignment before the client sees it.",
    recipientTitle: "Internal review link",
    recipientDescription:
      "Recipients can review the work in context, add feedback, and clearly understand this is still a working review.",
    nextStepLabel: "Collect notes",
    nextStepDescription:
      "Use timecoded or pinned feedback to refine the asset before it moves into client review.",
    permissionsLabel: "Comment access",
    defaults: {
      permissions: "comment",
      watermarkEnabled: true,
      downloadEnabled: false,
      expiresInDays: 7,
      requiresReviewerEmail: false,
    },
  },
  client_review: {
    value: "client_review",
    label: "Client review",
    shortLabel: "Client",
    dashboardTitle: "Share a polished review without implying sign-off",
    dashboardDescription:
      "Use this when the client should review, leave feedback, and request changes, but final approval is not being recorded yet.",
    recipientTitle: "Client review link",
    recipientDescription:
      "Recipients can review the asset, leave comments, and understand that feedback is still open.",
    nextStepLabel: "Gather feedback",
    nextStepDescription:
      "Collect client notes, resolve open questions, and move into approval only when the work is ready.",
    permissionsLabel: "Comment access",
    defaults: {
      permissions: "comment",
      watermarkEnabled: false,
      downloadEnabled: false,
      expiresInDays: 7,
      requiresReviewerEmail: false,
    },
  },
  approval_needed: {
    value: "approval_needed",
    label: "Approval-needed review",
    shortLabel: "Approval",
    dashboardTitle: "Request a decision from a named approver",
    dashboardDescription:
      "Use this when a specific client stakeholder needs to review the asset and record approval or request changes.",
    recipientTitle: "Approval review link",
    recipientDescription:
      "Recipients can comment and record an approval decision when their step is active in the workflow.",
    nextStepLabel: "Record a decision",
    nextStepDescription:
      "The recipient should review the asset, leave any final notes, and approve or request changes.",
    permissionsLabel: "Comment and approval access",
    defaults: {
      permissions: "approve",
      watermarkEnabled: false,
      downloadEnabled: false,
      expiresInDays: 7,
      requiresReviewerEmail: true,
    },
  },
  final_delivery: {
    value: "final_delivery",
    label: "Final delivery handoff",
    shortLabel: "Delivery",
    dashboardTitle: "Hand off the approved asset as a finished delivery",
    dashboardDescription:
      "Use this when review is complete and the client should receive a clean delivery experience instead of another feedback request.",
    recipientTitle: "Final delivery link",
    recipientDescription:
      "Recipients receive the asset as a finished handoff with clear download access and no open review state.",
    nextStepLabel: "Download the delivery",
    nextStepDescription:
      "The recipient should download or forward the approved asset rather than add more review notes.",
    permissionsLabel: "View and download access",
    defaults: {
      permissions: "view",
      watermarkEnabled: false,
      downloadEnabled: true,
      expiresInDays: 14,
      requiresReviewerEmail: false,
    },
  },
};

export const SHARE_INTENTS = [
  SHARE_INTENT_DEFINITIONS.internal_review,
  SHARE_INTENT_DEFINITIONS.client_review,
  SHARE_INTENT_DEFINITIONS.approval_needed,
  SHARE_INTENT_DEFINITIONS.final_delivery,
];

export function getShareIntentDefinition(intent: ShareIntent) {
  return SHARE_INTENT_DEFINITIONS[intent];
}

export function deriveShareIntent({
  permissions,
  downloadEnabled,
  watermarkEnabled,
}: ShareIntentInput): ShareIntent {
  if (permissions === "approve") {
    return "approval_needed";
  }

  if (permissions === "view") {
    return "final_delivery";
  }

  if (watermarkEnabled && downloadEnabled === false) {
    return "internal_review";
  }

  return "client_review";
}

export function normalizeShareIntent(value: unknown): ShareIntent | null {
  if (
    value === "internal_review" ||
    value === "client_review" ||
    value === "approval_needed" ||
    value === "final_delivery"
  ) {
    return value;
  }

  return null;
}

export function resolveShareIntentDefaults(intent: ShareIntent) {
  return SHARE_INTENT_DEFINITIONS[intent].defaults;
}

export function formatShareIntentMeta(intent: ShareIntent) {
  const definition = getShareIntentDefinition(intent);

  return {
    label: definition.label,
    shortLabel: definition.shortLabel,
    recipientTitle: definition.recipientTitle,
    recipientDescription: definition.recipientDescription,
    nextStepLabel: definition.nextStepLabel,
    nextStepDescription: definition.nextStepDescription,
    permissionsLabel: definition.permissionsLabel,
  };
}
