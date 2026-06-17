import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "baileys";
import { prisma } from "../prisma.js";
import { paths } from "../paths.js";
import { systemLog } from "../logging.js";

const inviteRegex = /^https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]{20,})$/;
const baileysVersion = "7.0.0-rc.9";

type BotState = "connected" | "disconnected" | "connecting" | "error";

class BotService {
  private socket?: WASocket;
  private starting?: Promise<void>;
  private status: BotState = "disconnected";
  private phoneNumber?: string;
  private lastConnection?: Date;
  private connectedSince?: Date;
  private errorMessage?: string;

  async startBot() {
    if (this.socket || this.starting) return this.starting;
    this.status = "connecting";
    this.starting = this.createSocket().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async createSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(paths.session);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] as [number, number, number] }));
    const sock = makeWASocket({ auth: state, version, printQRInTerminal: false, browser: ["Render Admin", "Chrome", "1.0.0"] });
    this.socket = sock;
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async (update) => {
      if (update.connection === "open") {
        this.status = "connected";
        this.phoneNumber = sock.user?.id?.split(":")[0];
        this.lastConnection = new Date();
        this.connectedSince = new Date();
        this.errorMessage = undefined;
        await systemLog("connection", "WhatsApp connected");
      }
      if (update.connection === "close") {
        const code = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        this.socket = undefined;
        this.status = code === DisconnectReason.loggedOut ? "disconnected" : "connecting";
        await systemLog("connection", `WhatsApp connection closed (${code || "unknown"})`);
        if (code !== DisconnectReason.loggedOut) setTimeout(() => void this.startBot(), 3000);
      }
      await this.persistStatus();
    });
    await this.persistStatus();
  }

  async requestPairingCode(phoneNumber: string) {
    await this.startBot();
    if (!this.socket) throw new Error("Socket indisponível para pareamento");
    const code = await this.socket.requestPairingCode(phoneNumber);
    await systemLog("pairing", `Pairing code generated for ${phoneNumber.slice(0, 4)}****${phoneNumber.slice(-2)}`);
    return code.replace(/(.{4})(?=.)/g, "$1-");
  }

  async analyzeGroup(inviteUrl: string) {
    const match = inviteRegex.exec(inviteUrl);
    if (!match) throw new Error("Link de convite inválido");
    await this.startBot();
    if (!this.socket) throw new Error("Bot não inicializado");
    const inviteCode = match[1];
    const inviteHash = crypto.createHash("sha256").update(inviteCode).digest("hex").slice(0, 16);
    await systemLog("group", "validating invite");
    const acceptedJid = await this.socket.groupAcceptInvite(inviteCode);
    if (!acceptedJid) throw new Error("Não foi possível entrar no grupo pelo convite informado");
    const jid = acceptedJid;
    await systemLog("group", "joined group");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const metadata = await this.socket.groupMetadata(jid);
    await systemLog("group", "metadata fetched");
    const participants = metadata.participants.map((participant) => {
      const technicalId = participant.id;
      const isLid = technicalId.includes("@lid") || technicalId.startsWith("lid:");
      const number = isLid ? null : technicalId.split("@")[0].replace(/\D/g, "");
      return {
        role: participant.admin === "superadmin" ? "Dono" : participant.admin ? "Admin" : "Membro",
        number: number || null,
        technicalId,
        type: isLid ? "LID" : "PN",
      };
    });
    await this.socket.groupLeave(jid);
    await systemLog("group", "left group");
    const exportBase = path.join(paths.exports, `${Date.now()}-${inviteHash}`);
    const txtPath = `${exportBase}.txt`;
    const csvPath = `${exportBase}.csv`;
    await fs.writeFile(txtPath, participants.map((p) => `${p.role}\t${p.number || ""}\t${p.technicalId}\t${p.type}`).join("\n"));
    await fs.writeFile(csvPath, ["role,number,technicalId,type", ...participants.map((p) => [p.role, p.number || "", p.technicalId, p.type].map(csv).join(","))].join("\n"));
    await systemLog("export", "TXT and CSV reports generated");
    return prisma.groupAnalysis.create({
      data: {
        groupName: metadata.subject || "Grupo sem nome",
        inviteHash,
        totalParticipants: participants.length,
        resolvedNumbers: participants.filter((p) => p.number).length,
        hiddenLids: participants.filter((p) => p.type === "LID").length,
        status: "success",
        txtPath,
        csvPath,
        participants: { create: participants },
      },
      include: { participants: true },
    });
  }

  async disconnect() {
    await this.socket?.end(undefined);
    this.socket = undefined;
    this.status = "disconnected";
    await this.persistStatus();
  }

  async logout() {
    await this.socket?.logout().catch(() => undefined);
    this.socket = undefined;
    await fs.rm(paths.session, { recursive: true, force: true });
    await fs.mkdir(paths.session, { recursive: true });
    this.status = "disconnected";
    await this.persistStatus();
  }

  async getStatus() {
    return {
      status: this.status,
      phoneNumber: this.phoneNumber,
      lastConnection: this.lastConnection,
      uptimeSeconds: this.connectedSince ? Math.floor((Date.now() - this.connectedSince.getTime()) / 1000) : 0,
      baileysVersion,
      environment: process.env.NODE_ENV || "development",
      errorMessage: this.errorMessage,
    };
  }

  private async persistStatus() {
    const status = await this.getStatus();
    await prisma.botSessionStatus.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...status },
      update: status,
    }).catch(() => undefined);
  }
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export const botService = new BotService();
