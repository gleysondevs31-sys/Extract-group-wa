export type BotStatus = { status: "connected" | "disconnected" | "connecting" | "error"; phoneNumber?: string; lastConnection?: string; uptimeSeconds: number; baileysVersion: string; environment: string; errorMessage?: string };
export type Participant = { id: string; role: "Dono" | "Admin" | "Membro"; number?: string; technicalId: string; type: "PN" | "LID" };
export type GroupReport = { id: string; groupName: string; totalParticipants: number; resolvedNumbers: number; hiddenLids: number; participants: Participant[]; createdAt: string; status: string; errorMessage?: string };
export type Health = { ok: boolean; database: string; disk: Record<string, boolean>; paths: Record<string, string>; nodeEnv?: string };
export type Settings = { paths: Record<string, string>; limits: { maxRunsPerHour: number; cooldownSeconds: number; maxGroupSize: number }; legalNotice: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: "Erro" }))).error || "Erro na API");
  return r.json();
}

export const api = {
  health: () => request<Health>("/api/health"),
  status: () => request<BotStatus>("/api/bot/status"),
  restart: () => request<{ ok: boolean }>("/api/bot/restart", { method: "POST" }),
  pairingCode: (phoneNumber: string) => request<{ code: string }>("/api/bot/pairing-code", { method: "POST", body: JSON.stringify({ phoneNumber }) }),
  disconnect: () => request("/api/bot/disconnect", { method: "POST" }),
  logout: () => request("/api/bot/logout", { method: "POST" }),
  analyze: (inviteUrl: string) => request<GroupReport>("/api/groups/analyze", { method: "POST", body: JSON.stringify({ inviteUrl }) }),
  history: (q = "") => request<GroupReport[]>(`/api/groups/history${q}`),
  historyDetail: (id: string) => request<GroupReport>(`/api/groups/history/${id}`),
  deleteHistory: (id: string) => request(`/api/groups/history/${id}`, { method: "DELETE" }),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (legalNotice: string) => request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify({ legalNotice }) }),
};
