INSERT INTO auth.users (id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO co_production.teams (id, name, owner_id)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Origin Runtime Team',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO co_production.intake_forms (
  id,
  team_id,
  opaque_key,
  name,
  creation_request_id,
  creation_request_hash,
  created_by
)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'ifm_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'Runtime intake',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO co_production.public_inquiry_rate_limits (
  intake_form_id,
  team_id,
  request_fingerprint,
  window_started_at,
  window_seconds,
  request_limit,
  request_count
)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'hmac-sha256:cco-public-inquiry-rate-limit:v1:2222222222222222222222222222222222222222222222222222222222222222',
  '2026-07-15T12:00:00Z',
  900,
  5,
  1
);

WITH inquiry_payload AS (
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.public-inquiry.v1',
    'formKey', 'ifm_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'idempotencyKey', 'origin-runtime-request-0001',
    'contact', pg_catalog.jsonb_build_object(
      'name', 'Runtime Reviewer',
      'email', 'reviewer@example.com',
      'phone', NULL
    ),
    'company', pg_catalog.jsonb_build_object(
      'name', 'Runtime Client',
      'website', 'https://example.com'
    ),
    'project', pg_catalog.jsonb_build_object(
      'title', 'Runtime Film',
      'goals', pg_catalog.jsonb_build_array('Prove canonical continuity'),
      'audiences', pg_catalog.jsonb_build_array('Enterprise buyers'),
      'requestedDeliverables', pg_catalog.jsonb_build_array('Hero film'),
      'references', '[]'::jsonb,
      'constraints', pg_catalog.jsonb_build_array('Review before release'),
      'notes', NULL
    ),
    'timeline', pg_catalog.jsonb_build_object(
      'desiredStartDate', '2026-08-03',
      'dueDate', '2026-09-18',
      'flexibility', 'fixed'
    ),
    'budgetSignal', pg_catalog.jsonb_build_object(
      'source', 'client_reported',
      'authority', 'non_authoritative',
      'band', 'unknown'
    ),
    'consent', pg_catalog.jsonb_build_object(
      'privacyAccepted', true,
      'policyVersion', 'privacy.v1',
      'marketingEmailOptIn', false,
      'operationalSmsOptIn', false,
      'operationalImessageOptIn', false
    )
  ) AS payload
)
INSERT INTO co_production.public_inquiries (
  id,
  intake_form_id,
  team_id,
  request_id,
  idempotency_key,
  payload,
  payload_hash,
  request_fingerprint,
  rate_limit_window_started_at,
  contact_name,
  contact_email,
  contact_phone,
  company_name,
  company_website,
  project_title,
  goals,
  audiences,
  requested_deliverables,
  reference_urls,
  constraints,
  notes,
  desired_start_date,
  due_date,
  timeline_flexibility,
  budget_band,
  privacy_accepted,
  consent_policy_version,
  marketing_email_opt_in,
  operational_sms_opt_in,
  operational_imessage_opt_in,
  consent_recorded_at
)
SELECT
  '40000000-0000-4000-8000-000000000004',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'origin-runtime-request-0001',
  payload,
  co_production_private.preproject_sha256(payload::text),
  'hmac-sha256:cco-public-inquiry-rate-limit:v1:2222222222222222222222222222222222222222222222222222222222222222',
  '2026-07-15T12:00:00Z',
  'Runtime Reviewer',
  'reviewer@example.com',
  NULL,
  'Runtime Client',
  'https://example.com',
  'Runtime Film',
  ARRAY['Prove canonical continuity'],
  ARRAY['Enterprise buyers'],
  ARRAY['Hero film'],
  ARRAY[]::text[],
  ARRAY['Review before release'],
  NULL,
  '2026-08-03',
  '2026-09-18',
  'fixed',
  'unknown',
  true,
  'privacy.v1',
  false,
  false,
  false,
  '2026-07-15T12:00:00Z'
FROM inquiry_payload;

INSERT INTO co_production.crm_accounts (
  id,
  team_id,
  source_inquiry_id,
  display_name,
  legal_name,
  website,
  authority_version,
  created_by
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '40000000-0000-4000-8000-000000000004',
  'Runtime Client',
  'Runtime Client LLC',
  'https://example.com',
  1,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO co_production.crm_contacts (
  id,
  team_id,
  account_id,
  source_inquiry_id,
  name,
  title,
  email,
  phone,
  marketing_email_consent_status,
  marketing_email_consent_address,
  operational_sms_consent_status,
  operational_sms_consent_address,
  operational_imessage_consent_status,
  operational_imessage_consent_address,
  consent_policy_version,
  consent_recorded_at,
  consent_source,
  authority_version,
  created_by
)
VALUES (
  '50000000-0000-4000-8000-000000000005',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  'Runtime Reviewer',
  'Marketing Lead',
  'reviewer@example.com',
  NULL,
  'denied',
  'reviewer@example.com',
  'denied',
  NULL,
  'denied',
  NULL,
  'privacy.v1',
  '2026-07-15T12:00:00Z',
  'public_inquiry',
  1,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO co_production.opportunities (
  id,
  team_id,
  account_id,
  primary_contact_id,
  source_inquiry_id,
  name,
  stage,
  probability_basis_points,
  expected_close_date,
  owner_id,
  authority_version
)
VALUES (
  '20000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000004',
  'Runtime Film',
  'proposal_sent',
  8000,
  '2026-07-31',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  2
);

INSERT INTO co_production.creative_brief_revisions (
  id,
  team_id,
  opportunity_id,
  source_inquiry_id,
  revision_number,
  status,
  title,
  objectives,
  audiences,
  key_messages,
  requested_deliverables,
  constraints,
  "references",
  success_criteria,
  content,
  content_hash,
  created_by
)
VALUES (
  '30000000-0000-4000-8000-000000000003',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '20000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000004',
  1,
  'ready_for_proposal',
  'Runtime Film Brief',
  ARRAY['Prove canonical continuity'],
  ARRAY['Enterprise buyers'],
  ARRAY['One source of truth'],
  ARRAY['Hero film'],
  ARRAY['Review before release'],
  ARRAY[]::text[],
  ARRAY['Accepted project retains origin'],
  '{"title":"Runtime Film Brief"}'::jsonb,
  'sha256:5b4d30e32d432f1f414bbb456eaa9ab8f59dc7c35af71f66f20fd96148a7ec4a',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

UPDATE co_production.opportunities
SET current_brief_revision_id = '30000000-0000-4000-8000-000000000003'
WHERE id = '20000000-0000-4000-8000-000000000002';

INSERT INTO co_production.proposal_integration_bindings (
  source_tenant_id,
  signing_key_id,
  public_key_pem,
  team_id,
  project_owner_id,
  active,
  activation_enabled,
  receiver_hmac_secret
)
VALUES (
  'content-co-op',
  'runtime-key',
  '-----BEGIN PUBLIC KEY-----runtime',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  true,
  true,
  pg_catalog.decode(pg_catalog.repeat('07', 32), 'hex')
);

CREATE TEMP TABLE origin_proof_payload (
  payload text NOT NULL
);

INSERT INTO origin_proof_payload (payload)
VALUES (
  '{"approvalReceiptIds":["approval-runtime"],"artifactRefs":[{"artifactId":"runtime-manifest","classification":"production_safe","kind":"production_manifest","sha256":"3333333333333333333333333333333333333333333333333333333333333333"},{"artifactId":"30000000-0000-4000-8000-000000000003","classification":"production_safe","kind":"brief","sha256":"5b4d30e32d432f1f414bbb456eaa9ab8f59dc7c35af71f66f20fd96148a7ec4a"}],"briefId":"30000000-0000-4000-8000-000000000003","clientId":"10000000-0000-4000-8000-000000000001","coCreditBudget":null,"decisionReceipt":{"actorId":"runtime-reviewer","consentTextVersion":"cco-client-acceptance@1","decidedAt":"2026-07-15T16:02:00Z","decision":"accepted","id":"decision-runtime","requestId":"request-runtime","viewReceiptId":"view-runtime"},"deliverables":[{"acceptanceCriteria":["Approved hero film"],"id":"deliverable-runtime","title":"Runtime hero film"}],"displayNumber":"0000200-B","idempotencyKey":"cco:proposal-package-origin-smoke:v1:b","intent":"activate","opportunityId":"20000000-0000-4000-8000-000000000002","origin":{"accountAuthorityVersion":1,"accountId":"10000000-0000-4000-8000-000000000001","authority":"co-videopro-crm","briefContentHash":"sha256:5b4d30e32d432f1f414bbb456eaa9ab8f59dc7c35af71f66f20fd96148a7ec4a","briefRevisionId":"30000000-0000-4000-8000-000000000003","briefRevisionNumber":1,"contactAuthorityVersion":1,"inquiryId":"40000000-0000-4000-8000-000000000004","opportunityAuthorityVersion":2,"opportunityId":"20000000-0000-4000-8000-000000000002","primaryContactId":"50000000-0000-4000-8000-000000000005"},"packageId":"proposal-package-origin-smoke","packageVersion":1,"productionModules":["Co-Script","Co-Edit","Co-Deliver"],"project":{"description":"Runtime activation proof","productionWindow":{"constraints":["Review before release"],"dueDate":"2026-09-18","startDate":"2026-08-03"},"title":"Runtime Film"},"proposalContentHash":"sha256:1111111111111111111111111111111111111111111111111111111111111111","proposalVersionId":"proposal-runtime-v1","quoteContentHash":"sha256:2222222222222222222222222222222222222222222222222222222222222222","quoteVersionId":"quote-runtime-v1","scopeItemIds":["development"],"sourceTenantId":"content-co-op"}'
);

WITH proofs AS (
  SELECT
    payload,
    'sha256:' || pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(payload, 'UTF8'), 'sha256'),
      'hex'
    ) AS payload_hash,
    pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(payload, 'UTF8'),
        pg_catalog.decode(pg_catalog.repeat('07', 32), 'hex'),
        'sha256'
      ),
      'hex'
    ) AS receiver_proof
  FROM origin_proof_payload
)
SELECT co_production.activate_proposal_handoff(
  'content-co-op',
  'runtime-key',
  '1.0.0',
  pg_catalog.jsonb_build_object(
    'keyId', 'runtime-key',
    'payloadHash', payload_hash
  ),
  payload,
  receiver_proof
)
FROM proofs;

WITH proofs AS (
  SELECT
    payload,
    'sha256:' || pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(payload, 'UTF8'), 'sha256'),
      'hex'
    ) AS payload_hash,
    pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(payload, 'UTF8'),
        pg_catalog.decode(pg_catalog.repeat('07', 32), 'hex'),
        'sha256'
      ),
      'hex'
    ) AS receiver_proof
  FROM origin_proof_payload
)
SELECT co_production.activate_proposal_handoff(
  'content-co-op',
  'runtime-key',
  '1.0.0',
  pg_catalog.jsonb_build_object(
    'keyId', 'runtime-key',
    'payloadHash', payload_hash
  ),
  payload,
  receiver_proof
)
FROM proofs;

DO $stale_origin_proof$
DECLARE
  v_payload text;
  v_payload_hash text;
  v_receiver_proof text;
BEGIN
  SELECT (
    payload::jsonb || pg_catalog.jsonb_build_object(
      'packageId', 'proposal-package-origin-stale',
      'idempotencyKey', 'cco:proposal-package-origin-stale:v1:b',
      'proposalVersionId', 'proposal-runtime-stale-v1',
      'quoteVersionId', 'quote-runtime-stale-v1',
      'displayNumber', '0000201-B'
    )
  )::text
  INTO v_payload
  FROM origin_proof_payload;

  v_payload_hash := 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload, 'UTF8'), 'sha256'),
    'hex'
  );
  v_receiver_proof := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_payload, 'UTF8'),
      pg_catalog.decode(pg_catalog.repeat('07', 32), 'hex'),
      'sha256'
    ),
    'hex'
  );

  PERFORM co_production.activate_proposal_handoff(
    'content-co-op',
    'runtime-key',
    '1.0.0',
    pg_catalog.jsonb_build_object(
      'keyId', 'runtime-key',
      'payloadHash', v_payload_hash
    ),
    v_payload,
    v_receiver_proof
  );

  RAISE EXCEPTION 'stale internal origin was accepted';
EXCEPTION
  WHEN SQLSTATE '40001' THEN
    IF SQLERRM IS DISTINCT FROM 'stale_or_mismatched_preproject_origin' THEN
      RAISE;
    END IF;
END
$stale_origin_proof$;

DO $proof$
DECLARE
  v_project_id uuid;
  v_stage text;
  v_version bigint;
  v_project_count bigint;
  v_receipt_count bigint;
  v_origin_count bigint;
  v_event_count bigint;
  v_source_linked boolean;
BEGIN
  SELECT origin.project_id
  INTO v_project_id
  FROM co_production.project_preproject_origins AS origin
  WHERE origin.opportunity_id = '20000000-0000-4000-8000-000000000002';

  SELECT opportunity.stage, opportunity.authority_version
  INTO v_stage, v_version
  FROM co_production.opportunities AS opportunity
  WHERE opportunity.id = '20000000-0000-4000-8000-000000000002';

  SELECT pg_catalog.count(*) INTO v_project_count
  FROM co_production.projects
  WHERE team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  SELECT pg_catalog.count(*) INTO v_receipt_count
  FROM co_production.proposal_handoff_receipts
  WHERE source_tenant_id = 'content-co-op';

  SELECT pg_catalog.count(*) INTO v_origin_count
  FROM co_production.project_preproject_origins
  WHERE project_id = v_project_id;

  SELECT pg_catalog.count(*) INTO v_event_count
  FROM co_production.opportunity_lifecycle_events
  WHERE project_id = v_project_id
    AND event_type = 'accepted_proposal_activated'
    AND from_authority_version = 2
    AND to_authority_version = 3;

  SELECT source.preproject_origin_linked
  INTO v_source_linked
  FROM co_production.project_operating_sources AS source
  WHERE source.project_id = v_project_id;

  IF v_project_id IS NULL
    OR v_stage IS DISTINCT FROM 'won'
    OR v_version IS DISTINCT FROM 3
    OR v_project_count IS DISTINCT FROM 1
    OR v_receipt_count IS DISTINCT FROM 1
    OR v_origin_count IS DISTINCT FROM 1
    OR v_event_count IS DISTINCT FROM 1
    OR v_source_linked IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION
      'runtime proof failed project=% stage=% version=% projects=% receipts=% origins=% events=% linked=%',
      v_project_id,
      v_stage,
      v_version,
      v_project_count,
      v_receipt_count,
      v_origin_count,
      v_event_count,
      v_source_linked;
  END IF;
END
$proof$;
