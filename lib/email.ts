/**
 * Email service using Resend (https://resend.com)
 * Requires RESEND_API_KEY environment variable
 */

import { formatShareIntentMeta, type ShareIntent } from "@/lib/sharing/share-intent";
import { getSiteUrl } from "@/lib/server-env";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ id: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured - email not sent");
    return null;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "noreply@codeliver.app",
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!response.ok) {
      console.error("Failed to send email:", await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Email service error:", error);
    return null;
  }
}

export function getBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return getSiteUrl();
}

function formatExpiry(expiresAt?: string | null) {
  if (!expiresAt) return "No expiration set";

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Expiration unavailable";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Email templates
export const emailTemplates = {
  approvalRequest: (approverEmail: string, assetTitle: string, projectName: string, reviewUrl: string) => ({
    subject: `Approval Needed: ${assetTitle}`,
    html: `
      <h2>Approval Requested</h2>
      <p>A new asset requires your approval:</p>
      <p><strong>Asset:</strong> ${assetTitle}</p>
      <p><strong>Project:</strong> ${projectName}</p>
      <p><a href="${reviewUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Review Asset</a></p>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">Please respond with your approval or request for changes.</p>
    `,
  }),

  shareInvite: ({
    assetTitle,
    shareLink,
    shareIntent,
    expiresAt,
  }: {
    inviteeEmail: string;
    assetTitle: string;
    shareLink: string;
    shareIntent: ShareIntent;
    expiresAt?: string | null;
  }) => {
    const meta = formatShareIntentMeta(shareIntent);
    const ctaLabel =
      shareIntent === "final_delivery"
        ? "Open Delivery"
        : shareIntent === "approval_needed"
          ? "Open Review and Approve"
          : "Open Review";
    const intro =
      shareIntent === "final_delivery"
        ? "A final asset has been handed off to you in Co-Deliver."
        : shareIntent === "approval_needed"
          ? "Your approval is needed on an asset in Co-Deliver."
          : `You have been invited into a ${meta.label.toLowerCase()} in Co-Deliver.`;

    return {
      subject: `${meta.label}: ${assetTitle}`,
      html: `
        <h2 style="margin-bottom: 8px;">${meta.label}</h2>
        <p style="margin-top: 0;">${intro}</p>
        <p><strong>Asset:</strong> ${assetTitle}</p>
        <p><strong>What to expect:</strong> ${meta.recipientDescription}</p>
        <p><strong>Next step:</strong> ${meta.nextStepDescription}</p>
        <p><strong>Expires:</strong> ${formatExpiry(expiresAt)}</p>
        <p>
          <a
            href="${shareLink}"
            style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;"
          >
            ${ctaLabel}
          </a>
        </p>
      `,
    };
  },

  commentNotification: (ownerEmail: string, authorName: string, assetTitle: string, commentBody: string, reviewUrl: string) => ({
    subject: `New comment on: ${assetTitle}`,
    html: `
      <h2>New Comment</h2>
      <p><strong>${authorName}</strong> commented on <strong>${assetTitle}</strong>:</p>
      <blockquote style="border-left: 4px solid #ddd; padding-left: 12px; margin: 12px 0; color: #666;">
        ${commentBody.substring(0, 200)}${commentBody.length > 200 ? "..." : ""}
      </blockquote>
      <p><a href="${reviewUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">View Comment</a></p>
    `,
  }),
};
