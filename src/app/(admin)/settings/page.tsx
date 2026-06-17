"use client";
import { useEffect, useState } from "react";
import { api, type Settings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>();
  const [notice, setNotice] = useState("");
  useEffect(() => { api.settings().then((s) => { setSettings(s); setNotice(s.legalNotice); }).catch((e) => toast.error(e.message)); }, []);
  return <section className="max-w-3xl space-y-6"><h1 className="text-2xl font-semibold">Configurações</h1><Card><CardHeader><CardTitle>Render e persistência</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 text-sm">{Object.entries(settings?.paths || {}).map(([k, v]) => <div key={k} className="flex justify-between rounded-lg border p-3"><span>{k}</span><code>{v}</code></div>)}</div><div className="grid gap-3 md:grid-cols-3"><div>Máx/hora: {settings?.limits.maxRunsPerHour}</div><div>Cooldown: {settings?.limits.cooldownSeconds}s</div><div>Máx grupo: {settings?.limits.maxGroupSize}</div></div><textarea className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm" value={notice} onChange={(e) => setNotice(e.target.value)} /><Button onClick={() => api.updateSettings(notice).then(() => toast.success("Aviso atualizado"))}>Salvar aviso</Button><Button variant="outline" onClick={() => api.health().then(() => toast.success("Saúde verificada"))}>Verificar saúde do sistema</Button></CardContent></Card></section>;
}
