/**
 * Email service using Resend (https://resend.com)
 * Requires RESEND_API_KEY environment variable
 */

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
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
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

  shareInvite: (inviteeEmail: string, assetTitle: string, shareLink: string) => ({
    subject: `You're invited to review: ${assetTitle}`,
    html: `
      <h2>Review Invitation</h2>
      <p>You've been invited to review an asset:</p>
      <p><strong>Asset:</strong> ${assetTitle}</p>
      <p><a href="${shareLink}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Open Review</a></p>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">This link is valid for 7 days. You can view the asset and leave comments.</p>
    `,
  }),

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
