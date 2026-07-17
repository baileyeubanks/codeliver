export const HEALTH_SERVICE_ID = "co-deliver" as const;
export const HEALTH_PRODUCT_NAME = "Co-VideoPro" as const;
export const HEALTH_BRAND_NAME = "Content Co-op" as const;

export function currentHealthPort(env: NodeJS.ProcessEnv = process.env): number | null {
  const port = Number(env.PORT);
  return Number.isSafeInteger(port) && port > 0 ? port : null;
}
