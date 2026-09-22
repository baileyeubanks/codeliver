import assert from "node:assert/strict";
import test from "node:test";

test("webpack evaluation is allowed only for explicitly enabled development demos", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, CODELIVER_DEMO_MODE: process.env.CODELIVER_DEMO_MODE };
  try {
    for (const [mode, demo, allowed] of [["production", "1", false], ["development", "0", false], ["development", "1", true]] as const) {
      Object.assign(process.env, { NODE_ENV: mode, CODELIVER_DEMO_MODE: demo });
      const { default: config } = await import(`../next.config.ts?mode=${mode}&demo=${demo}`);
      const routes = await config.headers();
      const csp = routes.flatMap((route: { headers: { key: string; value: string }[] }) => route.headers).find((header: {key:string}) => header.key === "Content-Security-Policy").value;
      assert.equal(csp.includes("'unsafe-eval'"), allowed, `${mode}/${demo}`);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
