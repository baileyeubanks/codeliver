import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import styles from "@/components/legal/LegalPage.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy (Draft) | Co‑VideoPro",
  description:
    "Draft privacy policy for Co‑VideoPro, Content Co-op's video review and delivery workspace.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy Policy"
      lede="This draft explains how Content Co-op expects to handle information in Co‑VideoPro, its video review and delivery workspace. It is pending owner review and may change before it becomes final."
    >
      <section className={styles.section}>
        <h2>1. Scope</h2>
        <p>
          This Privacy Policy applies to Co‑VideoPro accounts, workspaces,
          uploads, review pages, delivery links, and related support and email
          notifications operated by Content Co-op. It does not cover a
          customer&apos;s own privacy practices or services that Content Co-op
          does not control.
        </p>
      </section>

      <section className={styles.section}>
        <h2>2. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> names, email addresses,
            organization details, roles, authentication records, and account
            settings.
          </li>
          <li>
            <strong>Uploads and media storage:</strong> video, audio, images,
            documents, filenames, versions, delivery files, technical metadata,
            and storage records supplied to a workspace.
          </li>
          <li>
            <strong>Review activity:</strong> review links, invited recipient
            details when provided, time-coded comments, replies, approvals,
            change requests, and delivery activity.
          </li>
          <li>
            <strong>Communications:</strong> support messages, email
            notification preferences, notification delivery events, and other
            messages sent through the service.
          </li>
          <li>
            <strong>Technical information:</strong> IP address, browser and
            device information, timestamps, request logs, security events, and
            diagnostic data needed to operate the service.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>3. How we use information</h2>
        <p>Content Co-op expects to use this information to:</p>
        <ul>
          <li>create and secure accounts and control access to workspaces;</li>
          <li>receive, store, process, play, and deliver uploaded media;</li>
          <li>
            create review links and record comments, approvals, and delivery
            decisions;
          </li>
          <li>
            send requested account, review, approval, and email notifications;
          </li>
          <li>
            provide support, investigate incidents, prevent abuse, and maintain
            reliability; and
          </li>
          <li>
            understand and improve product performance using operational and
            usage information.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>4. Review links and collaboration</h2>
        <p>
          Workspace members can create links that let clients or collaborators
          view media and, where enabled, comment or approve. A recipient may be
          able to open a link without a Co‑VideoPro account. Link owners should
          choose access settings carefully and share links only with intended
          recipients. Forwarding a link may expose the linked media to someone
          else until access is revoked or expires.
        </p>
        <p>
          Co‑VideoPro may record link access, comments, approvals, and related
          technical events so the production team has a reliable review history.
        </p>
      </section>

      <section className={styles.section}>
        <h2>5. When information is disclosed</h2>
        <p>
          Content Co-op may disclose information to workspace owners and
          authorized collaborators, to vendors that process data under
          instructions, when required by law, to protect people or the service,
          or as part of a business transaction subject to appropriate
          safeguards.
        </p>
        <p>
          <strong>
            {
              "The intended policy is that Content Co-op does not sell personal information"
            }
          </strong>{" "}
          and does not use Co‑VideoPro workspace media for cross-context
          behavioral advertising. This no-sale and no-advertising posture
          remains subject to owner review before the policy is final.
        </p>
      </section>

      <section className={styles.section}>
        <h2>6. Service providers and sub-processors</h2>
        <p>
          Co‑VideoPro relies on infrastructure providers to run the service. The
          working sub-processor list for this draft is:
        </p>
        <dl className={styles.processorList}>
          <div>
            <dt>Supabase</dt>
            <dd>
              Account authentication, database services, and storage functions
              used by the application.
            </dd>
          </div>
          <div>
            <dt>Cloudflare</dt>
            <dd>
              Network delivery, edge security, and media delivery functions.
            </dd>
          </div>
          <div>
            <dt>Vercel</dt>
            <dd>
              Web application hosting, deployment, and operational delivery.
            </dd>
          </div>
          <div>
            <dt>Resend</dt>
            <dd>
              Transactional email notifications for account and review activity.
            </dd>
          </div>
        </dl>
        <p className={styles.processorNote}>
          <strong>Draft placeholder:</strong> this list, each provider&apos;s
          exact purpose, processing location, and contract status must be
          confirmed during owner and counsel review.
        </p>
      </section>

      <section className={styles.section}>
        <h2>7. Retention and security</h2>
        <p>
          Content Co-op expects to retain account, media, review, and
          operational records while needed to provide the service, satisfy a
          customer instruction or agreement, resolve disputes, maintain
          security, and meet legal obligations. Exact retention periods and
          deletion workflows remain to be confirmed before this draft becomes
          final.
        </p>
        <p>
          Co‑VideoPro uses administrative, technical, and organizational
          safeguards intended to protect information. No storage or transmission
          method is completely secure, and this draft does not promise absolute
          security.
        </p>
      </section>

      <section className={styles.section}>
        <h2>8. Choices and privacy requests</h2>
        <p>
          Account holders can update certain account details and notification
          preferences in the service. Requests to access, correct, export, or
          delete personal information will be handled according to applicable
          law and the authority of the relevant workspace owner. The final
          request channel and identity-verification process are pending owner
          review.
        </p>
      </section>

      <section className={styles.section}>
        <h2>9. Children, international use, and changes</h2>
        <p>
          Co‑VideoPro is a business production service and is not directed to
          children. Information may be processed where Content Co-op and its
          service providers operate; the final policy will identify any required
          transfer safeguards. Material policy changes will be posted here with
          an updated effective date.
        </p>
      </section>

      <section className={styles.section}>
        <h2>10. Contact</h2>
        <p>
          The privacy contact, mailing address, response timeline, and effective
          date are intentionally left as placeholders pending owner review. Do
          not treat this draft as the final published contact process.
        </p>
      </section>
    </LegalPage>
  );
}
