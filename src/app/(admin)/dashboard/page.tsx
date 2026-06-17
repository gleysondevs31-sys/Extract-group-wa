"use client";
import { useEffect, useState } from "react";
import { api, type BotStatus, type Health } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Dashboard() {
  const [status, setStatus] = useState<BotStatus>();
  const [health, setHealth] = useState<Health>();
  const load = () => Promise.all([api.status().then(setStatus), api.health().then(setHealth)]).catch((e) => toast.error(e.message));
  useEffect(() => { void load(); }, []);
  const cards = [
    ["Status do bot", status?.status], ["Número", status?.phoneNumber || "—"], ["Baileys", status?.baileysVersion],
    ["Banco", health?.database || "—"], ["Disco persistente", health ? Object.values(health.disk).every(Boolean) ? "ok" : "erro" : "—"],
    ["Tempo online", `${status?.uptimeSeconds || 0}s`],
  ];
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">Dashboard</h1><div className="grid gap-4 md:grid-cols-3">{cards.map(([k, v]) => <Card key={k}><CardHeader><CardTitle className="text-sm text-muted-foreground">{k}</CardTitle></CardHeader><CardContent className="text-xl font-medium">{v || "carregando"}</CardContent></Card>)}</div><div className="flex flex-wrap gap-3"><Button onClick={() => api.restart().then(() => toast.success("Bot reiniciado")).then(load)}>Reiniciar bot</Button><Button variant="outline" onClick={() => api.disconnect().then(() => toast.success("WhatsApp desconectado")).then(load)}>Desconectar WhatsApp</Button><Button variant="destructive" onClick={() => confirm("Apagar sessão persistente?") && api.logout().then(() => toast.success("Sessão apagada")).then(load)}>Apagar sessão</Button><Button variant="secondary" onClick={() => api.health().then(() => toast.success("Sistema saudável")).catch((e) => toast.error(e.message))}>Testar conexão</Button></div></section>;
}
