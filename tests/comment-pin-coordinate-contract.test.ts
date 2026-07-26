import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repairMigration = new URL(
  "../supabase/migrations/20260726113000_comment_pin_percentage_contract.sql",
  import.meta.url,
);
const authorityBaseline = new URL(
  "../supabase/migrations/20260715093300_fail_closed_co_production_authority.sql",
  import.meta.url,
);

test("comment pins use one explicit 0-100 percentage constraint", () => {
  const repair = readFileSync(repairMigration, "utf8");
  const baseline = readFileSync(authorityBaseline, "utf8");

  assert.match(
    repair,
    /LOCK TABLE co_production\.comments IN ACCESS EXCLUSIVE MODE;[\s\S]*IF EXISTS \([\s\S]*pin_x IS NOT NULL[\s\S]*pin_y IS NOT NULL[\s\S]*RAISE EXCEPTION[\s\S]*legacy comment pins require explicit coordinate remediation/,
  );
  for (const coordinate of ["x", "y"]) {
    const constraint = `comments_pin_${coordinate}_check`;
    assert.match(
      repair,
      new RegExp(`DROP CONSTRAINT IF EXISTS ${constraint}`),
    );
    assert.match(
      repair,
      new RegExp(
        `CONSTRAINT ${constraint}[\\s\\S]*pin_${coordinate} >= 0[\\s\\S]*pin_${coordinate} <= 100`,
      ),
    );
  }
  assert.match(
    repair,
    /CONSTRAINT comments_pin_pair_check[\s\S]*CHECK \(\(pin_x IS NULL\) = \(pin_y IS NULL\)\)[\s\S]*VALIDATE CONSTRAINT comments_pin_pair_check/,
  );
  assert.match(
    baseline,
    /CONSTRAINT comments_pin_pair_check[\s\S]*CHECK \(\(pin_x IS NULL\) = \(pin_y IS NULL\)\)/,
  );
  assert.doesNotMatch(repair, /pin_[xy]\s*<=\s*1(?!\d)/);
  assert.doesNotMatch(baseline, /pin_[xy]\s*<=\s*1(?!\d)/);
});
