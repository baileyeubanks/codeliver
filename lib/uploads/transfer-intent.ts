/** User intent wins over delayed upload discovery and network callbacks. */
export class TransferIntent {
  private paused = new Set<string>();
  private cancelled = new Set<string>();
  private discovered = new Set<string>();
  pause(id: string) { this.paused.add(id); }
  resume(id: string) { this.paused.delete(id); }
  cancel(id: string) { this.cancelled.add(id); }
  cancellationFailed(id: string) { this.cancelled.delete(id); }
  ready(id: string) { this.discovered.add(id); }
  isCancelled(id: string) { return this.cancelled.has(id); }
  isPaused(id: string) { return this.paused.has(id); }
  canStart(id: string) { return this.discovered.has(id) && !this.paused.has(id) && !this.cancelled.has(id); }
  reset(id: string) { this.paused.delete(id); this.cancelled.delete(id); this.discovered.delete(id); }
}

/** tus 4.x handles error events, but does not settle its promise on timeout. */
export function setTransferTimeout(xhr: XMLHttpRequest, timeout = 180_000) {
  xhr.timeout = timeout;
  xhr.ontimeout = () => { xhr.dispatchEvent(new Event("error")); };
}
