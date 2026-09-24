# OPINION — one-shot buildout plans (seat Opus 5.5)

**Opinion only.** This isn't a buildout plan, and nothing here Lands.
**On:** Bailey's proposal that each seat writes one end-to-end CVP buildout
plan. Each plan starts from the locked nav images plus the CVP locks:
- client + Content Co-op master accounts only;
- one `{client}.co-videopro.com` subdomain per client;
- multi-account;
- AI-fluid delivery;
- no crew.

The plans cross-argue, and Blaze forges one master.

## 1. Is this the right next move?

**Yes, with one condition (§4).** The waste this proposal targets is already
visible in the repo: Lands invent in the moment.
- [PR #25](https://github.com/baileyeubanks/codeliver/pull/25) and
  [PR #36](https://github.com/baileyeubanks/codeliver/pull/36) both built
  tap-comment on the same four review files.
- PR #25 also built share modes before the nav was picked.

Both happened because no contract said what the next Land was *for* or what
it could touch. A forged master that every Land cites stops that.

It's also the right time. The nav images are locked, and the account model
(client + CCO master, per-client subdomain) is a decision that touches auth,
routing, admission, and every surface. It's cheaper to settle once on paper
than to discover Land by Land.

**What it shouldn't do:**
- **Reopen the current cycle lock** (rows 1–6 in the spine). The plan governs
  what comes after.
- **Pull the ACS train into a CVP planning round.** ACS keeps its own spine,
  and a CVP plan shouldn't stall VA-106.

## 2. What each one-shot plan must contain to be useful

1. **A reuse ledger first.** List what already exists, with file or migration
   references, and what the plan builds on instead of rebuilding:
   - `co_production.deliverables` and its locked delivery;
   - version-bound approval rounds;
   - recipient-bound review admission;
   - the CCO OS commercial handoff fields;
   - PR #25's share-intent code;
   - the host-based client/admin surface routing.

   A plan without this ledger will rebuild the repo.
2. **Tenancy stated as mechanism, not as a slogan.**
   - How `{client}` resolves to an account.
   - What a CCO master account sees across clients, and what a client account
     sees inside one subdomain.
   - How sessions and cookies scope to the subdomain.
   - What happens to review links already sent on today's hosts.
   - The cross-account negative proof (client A can never read client B).
3. **Every screen in the locked nav images mapped to the record it reads and
   writes.** A screen with no named read or write is decoration. A write with
   no screen is invisible.
4. **"AI-fluid delivery" made concrete.**
   - Which drafted artifacts appear.
   - Where they appear.
   - What data each one reads.
   - What the operator approves.
   - What it's never allowed to do: send, spend, or approve on its own.

   If it can't be said this plainly, it isn't ready to build.
5. **An ordered Land list** as the plan's actual output. For each Land: one
   PR-sized unit, the files it may touch, the live-proof artifact, the Latch
   negative proof, and what it depends on. Size is counted in Lands, not in
   time.
6. **Standing gates named, not re-asked.** Migrations, DNS for the
   subdomains, and providers stay at Bailey's existing gates. Each gate is
   named where it falls in the Land list.
7. **A kill list.** What the plan retires or won't build, including the
   demo-only surfaces that fall outside the locks.
8. **The don't-break list:** live tip `46a256f2` and its overlay/logo PASS,
   `compress:false`, guest film-first, and the quiet auth door.

## 3. The credit-waste failure mode

**Three long plans that mostly agree, written in three vocabularies.**
- Each seat re-derives the same repo facts on its own.
- Blaze spends the forge reconciling names instead of settling the few real
  disagreements, such as the tenancy mechanism, Land order, and AI scope.
- The master comes out as prose.
- Lands then treat that prose as permission to build all of it, including the
  speculative parts (AI-fluid delivery, multi-account admin views), ahead of
  the review loop that earns money.

**The second failure is a big bang.** "One-shot end-to-end" gets read as one
giant Land. That's the fastest way to break the passed player tip and burn
the builder bucket on a merge nobody can prove.

## 4. The one change I'd make before running it

**Run the three plans against one shared baseline and one fixed template, and
forge by diff.**

Before any seat writes a plan, one pack (written once) produces the reuse
ledger (§2.1) and pins the locked nav images and CVP locks as the common
input. Every plan then uses the same headings from §2 and must end in the
same Land-list format. The seats only argue where their Land lists differ.
Blaze forges the master by merging Land lists row by row, not by blending
essays. That keeps the cross-argument about operations, keeps the
research-pool spend to one pack instead of three, and hands the Lands a list
they can't invent around.
