"use client";
import { useEffect, useState } from "react";
import { api, type GroupReport } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function History() {
  const [rows, setRows] = useState<GroupReport[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const load = () => api.history(`?name=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`).then(setRows);
  useEffect(() => { void load(); }, []);
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">Histórico</h1><div className="grid gap-2 md:grid-cols-[1fr_180px_auto]"><Input placeholder="Filtrar por nome do grupo" value={q} onChange={(e) => setQ(e.target.value)} /><select className="rounded-lg border bg-background px-3" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option><option value="success">Sucesso</option><option value="error">Erro</option></select><Button onClick={load}>Filtrar</Button></div><div className="overflow-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted text-left"><th className="p-3">Grupo</th><th>Status</th><th>Total</th><th>Resolvidos</th><th>LIDs</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>{rows.map((r) => <tr className="border-b" key={r.id}><td className="p-3">{r.groupName}</td><td>{r.status}</td><td>{r.totalParticipants}</td><td>{r.resolvedNumbers}</td><td>{r.hiddenLids}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td className="flex gap-1 py-2"><Button variant="ghost" onClick={() => window.open(`/api/groups/history/${r.id}/download.txt`, "_blank")}>TXT</Button><Button variant="ghost" onClick={() => window.open(`/api/groups/history/${r.id}/download.csv`, "_blank")}>CSV</Button><Button variant="ghost" onClick={() => api.deleteHistory(r.id).then(load)}>Excluir</Button></td></tr>)}</tbody></table></div></section>;
}
