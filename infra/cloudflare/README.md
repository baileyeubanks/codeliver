# Co-Deliver Cloudflare Tunnels

This directory contains reviewable, secret-free deployment artifacts for two
dedicated, locally managed Cloudflare Tunnels on the M4 host. It does not create
credentials, DNS records, Access policies, launch daemons, or deployments.

## Discovered production contract

| Profile | Tunnel | Exact hostname | Origin `Host` | Metrics |
| --- | --- | --- | --- | --- |
| admin | `cco-codeliver-admin` (`5195d10d-ec77-4921-876d-496e50b406a1`) | `admin.contentco-op.com` | `admin.contentco-op.com` | `127.0.0.1:20241` |
| client | `cco-codeliver-client` (`d763c03a-a188-4a2d-ab9d-e9037319fedf`) | `client.contentco-op.com` | `client.contentco-op.com` | `127.0.0.1:20242` |

Each connector targets the production-built Co-Deliver runtime at
`http://127.0.0.1:4103`. Each config contains one exact hostname and explicitly
sets the corresponding origin `Host` header. There are no wildcard hostnames.
Cloudflare requires a final ingress rule, so each config ends in a deny-only
`http_status:404` rule that never forwards an unlisted hostname.

Discovery state at preparation time:

- Both named tunnels exist on M4 and have no DNS routes.
- `admin.contentco-op.com` currently points to the existing
  `cco-mission-control` / public-site path. It must be captured and preserved as
  the admin rollback target before any future cutover.
- `client.contentco-op.com` does not currently exist. A future rollback should
  remove only the newly created client record.

## Artifact layout

- `admin/config.yml.tmpl`: admin tunnel UUID, credential path, route, Host
  override, and metrics contract.
- `client/config.yml.tmpl`: equivalent isolated client contract.
- `launchd/*.plist`: separate root launch daemons using the M4 Homebrew binary.
- `validate-config.sh`: authoritative Cloudflare ingress and permission checks.
- `validate-launchd.sh`: plist syntax, arguments, paths, restart, and ownership
  checks.
- `validate-runtime.sh`: static, local preflight, and read-only running checks.
- `health-check.sh`: profile-specific origin, connector, and public probes.
- `tests/config.test.sh`: static and mocked-runtime tests with no live actions.

The tunnel UUID and credential file path are identifiers, not secrets. The JSON
file at that path is secret and must remain outside git with mode `0600`. No
account-wide `cert.pem`, tunnel token, or credential content belongs in these
artifacts or launch daemon arguments.

## Static validation

These checks parse the config with the installed `cloudflared`, lint both
property lists with `plutil`, exercise negative mutations, and use local mock
health endpoints. They make no Cloudflare or DNS request:

```bash
./infra/cloudflare/tests/config.test.sh
./infra/cloudflare/validate-runtime.sh admin static
./infra/cloudflare/validate-runtime.sh client static
```

## M4 file installation guidance

Do not use `cloudflared service install` for these tunnels. That command owns a
single default service label and config path; these dedicated tunnels need two
explicit launch daemons with distinct labels and metrics ports.

First inspect M4 and preserve anything already present:

```bash
sudo launchctl print system/com.contentcoop.codeliver-admin.cloudflared
sudo launchctl print system/com.contentcoop.codeliver-client.cloudflared
sudo find /etc/cloudflared /Library/LaunchDaemons -maxdepth 1 -type f -print
```

The tunnel creation step should already have produced one credential JSON per
tunnel. Move or install those existing files to the exact paths referenced by
the templates. Do not generate or paste credential content into the repository.

Install the secret-free configs and launch daemon definitions only in an
approved M4 change window:

```bash
sudo install -d -o root -g wheel -m 0750 /etc/cloudflared
sudo install -o root -g wheel -m 0600 \
  infra/cloudflare/admin/config.yml.tmpl \
  /etc/cloudflared/cco-codeliver-admin.yml
sudo install -o root -g wheel -m 0600 \
  infra/cloudflare/client/config.yml.tmpl \
  /etc/cloudflared/cco-codeliver-client.yml

sudo install -o root -g wheel -m 0644 \
  infra/cloudflare/launchd/com.contentcoop.codeliver-admin.cloudflared.plist \
  /Library/LaunchDaemons/com.contentcoop.codeliver-admin.cloudflared.plist
sudo install -o root -g wheel -m 0644 \
  infra/cloudflare/launchd/com.contentcoop.codeliver-client.cloudflared.plist \
  /Library/LaunchDaemons/com.contentcoop.codeliver-client.cloudflared.plist
```

Before loading either daemon, validate the installed files, credential
permissions, and Co-Deliver readiness under the exact Host header:

```bash
sudo ./infra/cloudflare/validate-runtime.sh admin preflight
sudo ./infra/cloudflare/validate-runtime.sh client preflight
```

## Launchd run guidance

Load one profile at a time and validate it before proceeding to the other. These
commands start outbound tunnel connectors, so they require explicit approval:

```bash
sudo launchctl bootstrap system \
  /Library/LaunchDaemons/com.contentcoop.codeliver-admin.cloudflared.plist
sudo launchctl enable system/com.contentcoop.codeliver-admin.cloudflared
sudo launchctl kickstart -k system/com.contentcoop.codeliver-admin.cloudflared
sudo ./infra/cloudflare/validate-runtime.sh admin running

sudo launchctl bootstrap system \
  /Library/LaunchDaemons/com.contentcoop.codeliver-client.cloudflared.plist
sudo launchctl enable system/com.contentcoop.codeliver-client.cloudflared
sudo launchctl kickstart -k system/com.contentcoop.codeliver-client.cloudflared
sudo ./infra/cloudflare/validate-runtime.sh client running
```

The `running` mode reads local launchd state, Co-Deliver health, and connector
readiness/metrics only. It does not create DNS routes or alter Cloudflare.

For an approved foreground diagnostic instead of launchd:

```bash
sudo /opt/homebrew/bin/cloudflared tunnel \
  --config /etc/cloudflared/cco-codeliver-admin.yml run
sudo /opt/homebrew/bin/cloudflared tunnel \
  --config /etc/cloudflared/cco-codeliver-client.yml run
```

## Health contract

Co-Deliver must pass both local probes for each exact Host header:

```bash
./infra/cloudflare/health-check.sh admin origin
./infra/cloudflare/health-check.sh client origin
```

After a connector is running locally:

```bash
./infra/cloudflare/health-check.sh admin connector
./infra/cloudflare/health-check.sh client connector
```

Only after a separately approved DNS cutover:

```bash
./infra/cloudflare/health-check.sh admin public
./infra/cloudflare/health-check.sh client public
```

Readiness requires Co-Deliver's required database and storage dependencies, not
merely a listening process. The scripts do not follow redirects and fail closed
on non-JSON, wrong-service, wrong-probe, or non-ready responses.

## Future DNS change boundary

No DNS command was run while preparing these artifacts. In a future approved
window, capture the full admin record first: record ID, type, target, proxied
state, and TTL. Do not assume the current public-site target from its display
name alone.

The intended future routes are one-to-one:

```bash
cloudflared tunnel route dns --overwrite-dns \
  5195d10d-ec77-4921-876d-496e50b406a1 admin.contentco-op.com
cloudflared tunnel route dns \
  d763c03a-a188-4a2d-ab9d-e9037319fedf client.contentco-op.com
```

The admin overwrite flag is intentional and must be used only after the current
record has been captured and the cutover is approved. The client command omits
it so an unexpected pre-existing record fails closed.

Never add `*.contentco-op.com`, the zone apex, or a hostname to the wrong
tunnel. Cloudflare Access for admin is a separate control-plane review; these
files neither create nor weaken it.

## Rollback commands

Rollback DNS before stopping its connector. For admin, restore the captured
`cco-mission-control` / public-site DNS record exactly. If that target is itself
a named tunnel, the command shape is:

```bash
cloudflared tunnel route dns --overwrite-dns \
  "$PREVIOUS_ADMIN_TUNNEL_UUID" admin.contentco-op.com
```

If it is not a tunnel CNAME, restore the captured record through the Cloudflare
DNS API or dashboard rather than inventing a tunnel UUID.

For client, delete only the record created during the change, using the record
ID captured from that create operation:

```bash
curl --fail-with-body --request DELETE \
  --url "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${CLIENT_RECORD_ID}" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
unset CLOUDFLARE_API_TOKEN
```

After DNS rollback, unload only the affected connector:

```bash
sudo launchctl bootout \
  system/com.contentcoop.codeliver-admin.cloudflared
sudo launchctl bootout \
  system/com.contentcoop.codeliver-client.cloudflared
```

Run only the line for the profile being rolled back. Do not delete either
tunnel or credential in a normal rollback; DNS, connector service, and tunnel
lifecycle are independent.

To restore a prior local config, install its reviewed backup and restart only
that label:

```bash
sudo install -o root -g wheel -m 0600 \
  /path/to/cco-codeliver-admin.yml.rollback \
  /etc/cloudflared/cco-codeliver-admin.yml
sudo launchctl kickstart -k \
  system/com.contentcoop.codeliver-admin.cloudflared
```

Use the equivalent client paths and label for client rollback.

## References

- [Cloudflare configuration files](https://developers.cloudflare.com/tunnel/advanced/local-management/configuration-file/)
- [Cloudflare origin parameters](https://developers.cloudflare.com/tunnel/advanced/origin-parameters/)
- [Cloudflare macOS service guidance](https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/macos/)
- [Cloudflare tunnel monitoring](https://developers.cloudflare.com/tunnel/monitoring/)
- [Cloudflare DNS routing](https://developers.cloudflare.com/tunnel/routing/)
