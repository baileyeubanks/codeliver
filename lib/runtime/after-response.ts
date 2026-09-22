import { after } from "next/server";

/** Register durable work with the Next response lifecycle on the self-hosted
 * Node runtime. The callback starts only after the response is ready to send. */
export function afterResponse(task: () => Promise<void> | void): void {
  after(task);
}
