import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import styles from "@/components/legal/LegalPage.module.css";

export const metadata: Metadata = {
  title: "Terms of Service (Draft) | Co‑VideoPro",
  description:
    "Draft terms for Co‑VideoPro, Content Co-op's video review and delivery workspace.",
};

export default function TermsPage() {
  return (
    <LegalPage
      current="terms"
      title="Terms of Service"
      lede="These draft Terms describe the expected rules for using Co‑VideoPro, Content Co-op's video review and delivery service. They are pending owner review and are not final terms."
    >
      <section className={styles.section}>
        <h2>1. Draft status and agreement</h2>
        <p>
          Co‑VideoPro is a workspace for production teams and clients to manage
          uploads, share review links, collect comments and approvals, and
          deliver finished files. These Terms of Service are a working Draft —
          pending owner review. Final terms will identify the effective date and
          the Content Co-op legal entity offering the service.
        </p>
      </section>

      <section className={styles.section}>
        <h2>2. Eligibility and accounts</h2>
        <p>
          Users must be able to form a binding agreement and must have authority
          to act for any organization they add to Co‑VideoPro. Account
          information must be accurate. Users are responsible for protecting
          login credentials, for activity under their accounts, and for promptly
          reporting suspected unauthorized access.
        </p>
        <p>
          Workspace roles and permissions control what a user can view or
          change. Account access does not by itself grant rights to every
          project, upload, review, or delivery.
        </p>
      </section>

      <section className={styles.section}>
        <h2>3. Customer content and permissions</h2>
        <p>
          Customers and users keep their ownership rights in videos, audio,
          images, documents, comments, approvals, and other material they upload
          or submit to the service. They grant Content Co-op the limited
          permission needed to host, store, copy, process, transcode, display,
          and deliver that material to operate Co‑VideoPro and provide requested
          support.
        </p>
        <p>
          A user must have all rights, releases, licenses, and permissions
          needed for the content and people represented in it. Content Co-op
          does not claim ownership of customer media merely because it is stored
          in Co‑VideoPro.
        </p>
      </section>

      <section className={styles.section}>
        <h2>4. Review links, comments, and approvals</h2>
        <p>
          Users may create review links for clients and collaborators. The link
          creator is responsible for selecting suitable access settings and
          intended recipients. Recipients must not forward, publish, download,
          or reuse linked material unless the project owner permits it.
        </p>
        <p>
          Comments, approvals, and change requests form part of a project&apos;s
          review record, but Co‑VideoPro does not independently verify a
          commenter&apos;s identity, authority, or creative decision. Production
          teams remain responsible for confirming that a final approval comes
          from the right person.
        </p>
      </section>

      <section className={styles.section}>
        <h2>5. Acceptable use</h2>
        <p>Users must not use Co‑VideoPro to:</p>
        <ul>
          <li>
            upload or distribute content they do not have permission to use;
          </li>
          <li>
            violate privacy, publicity, intellectual-property, or other legal
            rights;
          </li>
          <li>
            send malware, probe security, evade access controls, or disrupt the
            service;
          </li>
          <li>
            share credentials or review links in a way that defeats intended
            permissions;
          </li>
          <li>harass, exploit, or harm another person; or</li>
          <li>use the service for unlawful, deceptive, or abusive activity.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>6. Email notifications</h2>
        <p>
          Co‑VideoPro may send transactional email notifications about accounts,
          invitations, review links, comments, approvals, deliveries, security,
          and service operations. Users can manage available notification
          preferences, but essential account and security messages may still be
          sent.
        </p>
      </section>

      <section className={styles.section}>
        <h2>7. Storage, availability, and changes</h2>
        <p>
          Upload limits, media storage, retention, playback formats, and
          delivery availability may depend on the customer&apos;s plan or
          project agreement. Users should keep independent copies of source and
          final media. Content Co-op may maintain, change, suspend, or
          discontinue features to protect security, comply with law, or operate
          the service.
        </p>
        <p>
          Specific service levels, backup commitments, retention periods, and
          remedies apply only when they are stated in a signed order, statement
          of work, or other written agreement.
        </p>
      </section>

      <section className={styles.section}>
        <h2>8. Fees and customer agreements</h2>
        <p>
          If a subscription, order, or Content Co-op statement of work includes
          fees, payment timing, cancellation, taxes, and usage limits, that
          document controls those commercial terms. If a signed customer
          agreement conflicts with these Terms, the signed agreement controls
          for that customer.
        </p>
      </section>

      <section className={styles.section}>
        <h2>9. Third-party services and privacy</h2>
        <p>
          Co‑VideoPro uses service providers for authentication, hosting,
          storage, network delivery, and transactional email. The draft Privacy
          Policy describes the current placeholder sub-processor list and
          expected data practices. Third-party services remain subject to their
          own terms and controls.
        </p>
      </section>

      <section className={styles.section}>
        <h2>10. Suspension and termination</h2>
        <p>
          Content Co-op may restrict or suspend access when reasonably needed to
          address a security risk, unlawful use, nonpayment under an applicable
          agreement, material breach, or harm to the service or others. The
          final Terms must confirm notice, cure, termination, export, and
          deletion procedures.
        </p>
      </section>

      <section className={styles.section}>
        <h2>11. Warranties and liability</h2>
        <p>
          To the extent permitted by law, the service is expected to be offered
          on an “as is” and “as available” basis unless a signed agreement says
          otherwise. Content Co-op does not guarantee that every upload,
          notification, review link, or delivery will be uninterrupted or
          error-free.
        </p>
        <p>
          Warranty exclusions, any liability cap, excluded damages,
          indemnification obligations, and the treatment of rights that cannot
          legally be waived are placeholders that require owner and counsel
          approval before these Terms become final.
        </p>
      </section>

      <section className={styles.section}>
        <h2>12. Governing terms and contact</h2>
        <p>
          Governing law, venue, dispute procedures, formal notice details, the
          service contact, and the effective date are intentionally pending
          owner review. Changes to final Terms will be posted on this page, and
          any required advance notice will be provided through the service or by
          email.
        </p>
      </section>
    </LegalPage>
  );
}
