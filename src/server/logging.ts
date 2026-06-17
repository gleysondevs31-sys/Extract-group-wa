import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type LogClient = { write: (chunk: string) => void };
const clients = new Set<LogClient>();

export function sanitize(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
    .replace(/(ADMIN_TOKEN|INTERNAL_API_TOKEN|auth_info|creds\.json)=?\S*/gi, "$1=[redacted]");
}

export async function systemLog(category: string, message: string, level = "info") {
  const safe = sanitize(message);
  await prisma.systemLog.create({ data: { category, message: safe, level } }).catch(() => undefined);
  const payload = JSON.stringify({ at: new Date().toISOString(), category, level, message: safe });
  clients.forEach((client) => client.write(`data: ${payload}\n\n`));
}

export async function audit(action: string, actor?: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { action, actor, metadata: (metadata || {}) as Prisma.InputJsonValue } }).catch(() => undefined);
}

export function addLogClient(client: LogClient) {
  clients.add(client);
  return () => clients.delete(client);
}
