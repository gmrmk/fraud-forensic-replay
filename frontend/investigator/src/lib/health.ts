/** Typed client for /api/health: liveness + restart detection. */

export interface Health {
  status: string;
  /** Changes on every backend process start; a cached older value means
   *  this tab's world (active scenario, data) may have been reset. */
  boot_id: string;
  scenario: string;
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health HTTP ${res.status}`);
  return res.json() as Promise<Health>;
}
