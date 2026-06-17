import express from "express";
import next from "next";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cookie from "cookie";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "./src/server/prisma.js";
import { ensureDataDirs, paths } from "./src/server/paths.js";
import { addLogClient, audit, systemLog } from "./src/server/logging.js";
import { botService } from "./src/server/services/bot.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 10000);
const app = next({ dev });
const handle = app.getRequestHandler();
const adminCookie = "admin_session";

function isPrivateApi(path: string) {
  return path.startsWith("/api/") && !["/api/health", "/api/auth/login", "/api/auth/logout"].includes(path);
}

function isAuthenticated(req: express.Request) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const bearer = req.headers.authorization === `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  return bearer || (!!process.env.ADMIN_TOKEN && cookies[adminCookie] === process.env.ADMIN_TOKEN);
}

await ensureDataDirs();
await app.prepare();
void botService.startBot().catch((error) => systemLog("error", `Bot startup failed: ${String(error?.message || error)}`, "error"));

const server = express();
server.set("trust proxy", 1);
server.use(helmet({ contentSecurityPolicy: false }));
server.use(express.json({ limit: "64kb" }));
server.use(rateLimit({ windowMs: 60_000, limit: 120 }));
server.use((req, res, nextFn) => {
  if (isPrivateApi(req.path) && !isAuthenticated(req)) return res.status(401).json({ error: "unauthorized" });
  nextFn();
});

server.get("/api/health", async (_req, res) => {
  const disk = await Promise.all(Object.entries(paths).map(async ([key, value]) => [key, value, await exists(value)]));
  const database = await prisma.$queryRaw`SELECT 1`.then(() => "connected").catch(() => "error");
  res.json({ ok: true, database, disk: Object.fromEntries(disk.map(([k, , ok]) => [k, ok])), paths, nodeEnv: process.env.NODE_ENV });
});

server.post("/api/auth/login", async (req, res) => {
  const body = z.object({ token: z.string().min(8) }).safeParse(req.body);
  if (!body.success || body.data.token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: "Token inválido" });
  res.cookie(adminCookie, body.data.token, { httpOnly: true, secure: !dev, sameSite: "lax", path: "/" });
  await audit("login", req.ip, { userAgent: req.headers["user-agent"] });
  res.json({ ok: true });
});

server.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(adminCookie, { path: "/" });
  res.json({ ok: true });
});

server.get("/api/bot/status", async (_req, res) => res.json(await botService.getStatus()));
server.post("/api/bot/pairing-code", async (req, res) => safe(res, async () => {
  const { phoneNumber } = z.object({ phoneNumber: z.string().regex(/^\d{10,15}$/) }).parse(req.body);
  await audit("generate_pairing_code", req.ip, { phonePrefix: phoneNumber.slice(0, 4) });
  return { code: await botService.requestPairingCode(phoneNumber) };
}));
server.post("/api/bot/restart", async (req, res) => safe(res, async () => { await audit("restart_bot", req.ip); await botService.disconnect(); await botService.startBot(); return { ok: true }; }));
server.post("/api/bot/disconnect", async (req, res) => safe(res, async () => { await audit("disconnect_whatsapp", req.ip); await botService.disconnect(); return { ok: true }; }));
server.post("/api/bot/logout", async (req, res) => safe(res, async () => { await audit("logout_whatsapp", req.ip); await botService.logout(); return { ok: true }; }));
server.post("/api/groups/analyze", async (req, res) => safe(res, async () => {
  const { inviteUrl } = z.object({ inviteUrl: z.string().regex(/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{20,}$/) }).parse(req.body);
  await audit("analyze_group", req.ip, { inviteHash: crypto.createHash("sha256").update(inviteUrl).digest("hex").slice(0, 16) });
  return botService.analyzeGroup(inviteUrl);
}));
server.get("/api/groups/history", async (req, res) => {
  const name = String(req.query.name || "");
  const status = String(req.query.status || "");
  res.json(await prisma.groupAnalysis.findMany({ where: { ...(name ? { groupName: { contains: name, mode: "insensitive" as const } } : {}), ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, include: { participants: true }, take: 100 }));
});
server.get("/api/groups/history/:id", async (req, res) => safe(res, () => prisma.groupAnalysis.findUniqueOrThrow({ where: { id: req.params.id }, include: { participants: true } })));
server.delete("/api/groups/history/:id", async (req, res) => safe(res, async () => { await prisma.groupAnalysis.delete({ where: { id: req.params.id } }); await audit("delete_history", req.ip, { id: req.params.id }); return { ok: true }; }));
server.get("/api/groups/history/:id/download.:format", async (req, res) => safe(res, async () => {
  const row = await prisma.groupAnalysis.findUniqueOrThrow({ where: { id: req.params.id } });
  const file = req.params.format === "csv" ? row.csvPath : row.txtPath;
  if (!file) throw new Error("Export não encontrado");
  res.download(file);
  return undefined;
}));
server.get("/api/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders?.();
  const remove = addLogClient(res);
  res.write(`data: ${JSON.stringify({ at: new Date().toISOString(), category: "connection", message: "SSE connected" })}\n\n`);
  req.on("close", remove);
});
server.get("/api/settings", async (_req, res) => res.json(await settingsPayload()));
server.patch("/api/settings", async (req, res) => safe(res, async () => {
  const body = z.object({ legalNotice: z.string().min(20).optional() }).parse(req.body);
  if (body.legalNotice) await prisma.setting.upsert({ where: { key: "legalNotice" }, create: { key: "legalNotice", value: body.legalNotice }, update: { value: body.legalNotice } });
  return settingsPayload();
}));
server.all("*", (req, res) => handle(req, res));
server.listen(port, () => console.log(`Ready on http://0.0.0.0:${port}`));

async function safe(res: express.Response, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    if (!res.headersSent) res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    await systemLog("error", message, "error");
    if (!res.headersSent) res.status(400).json({ error: message });
  }
}
async function exists(path: string) { return fs.access(path).then(() => true).catch(() => false); }
async function settingsPayload() {
  const legalNotice = await prisma.setting.findUnique({ where: { key: "legalNotice" } });
  return { paths, limits: { maxRunsPerHour: 5, cooldownSeconds: 600, maxGroupSize: 1200 }, legalNotice: legalNotice?.value || "Use esta ferramenta apenas em grupos próprios, com autorização e consentimento, para finalidades internas permitidas." };
}
