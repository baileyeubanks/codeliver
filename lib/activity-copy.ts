const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  added_comment: "added a review comment",
  approved_asset: "approved a version",
  approvals_reset: "reset approvals for a new version",
  approval_notification_sent: "sent an approval notification",
  review_round_started: "started a new version review round",
  archived_asset: "archived media",
  created_project: "created a project",
  created_review_link: "created a review link",
  downloaded_published_artifact: "downloaded a published artifact",
  marked_cut_decision: "marked an edit decision",
  moved_asset_to_trash: "moved media to Trash",
  proposed_edit_decision: "proposed an edit decision",
  recorded_edit_decision: "recorded an edit decision",
  recorded_public_approval: "recorded an external approval",
  review_completed: "completed a review",
  team_created: "created a team",
  team_deleted: "deleted a team",
  team_invite_accepted: "accepted a team invite",
  team_invite_declined: "declined a team invite",
  team_invite_sent: "sent a team invite",
  team_member_removed: "removed a team member",
  team_renamed: "renamed a team",
  team_role_changed: "changed a team role",
  uploaded_asset: "uploaded media",
  uploaded_new_version: "uploaded a new version",
  uploaded_version: "uploaded a new version",
  webhook_created: "created a webhook",
};

export function formatActivityAction(action: string) {
  return ACTIVITY_ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function formatActivitySubject(details?: Record<string, string> | null) {
  return details?.asset_title ?? details?.project_name ?? "";
}
