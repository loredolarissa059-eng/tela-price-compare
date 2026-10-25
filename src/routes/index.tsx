import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { parseDescription, parsePrice, groupKey, type SourceKind } from "@/lib/normalize";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cotação de Telas — compare fornecedores" },
      { name: "description", content: "Suba planilhas Excel de fornecedores e concorrentes e veja onde cada tela sai mais barata." },
      { property: "og:title", content: "Cotação de Telas" },
      { property: "og:description", content: "Compare preços de telas por modelo e qualidade entre várias planilhas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

interface Item { desc: string; price: number }
interface Source { id: string; name: string; kind: SourceKind; rows: Item[] }

const CATALOG_URL = "https://jxcjgkbecvtqhydqecej.supabase.co/rest/v1/rpc/catalogo_v1_public_catalog";
const CATALOG_KEY = "sb_publishable_80JQyTVag3qhgrZMcZUpMg_w1sUHysh";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function readSheet(rows: unknown[][]): Item[] {
  let hi = rows.findIndex((r) => r.some((c) => /desc|produto|nome|modelo|item/i.test(String(c ?? ""))));
  let dCol = -1, pCol = -1;
  if (hi >= 0) {
    (rows[hi] ?? []).forEach((c, i) => {
      const t = String(c ?? "");
      if (dCol < 0 && /desc|produto|nome|modelo|item/i.test(t)) dCol = i;
      if (pCol < 0 && /pre[cç]o|valor|price|r\$/i.test(t)) pCol = i;
    });
  }
  const body = rows.slice(hi + 1);
  if (dCol < 0) dCol = (body[0] ?? []).findIndex((c) => typeof c === "string");
  if (pCol < 0) pCol = (body[0] ?? []).findIndex((c, i) => i !== dCol && parsePrice(c) !== null);
  if (hi < 0) hi = -1;
  return body
    .map((r) => ({ desc: String(r[dCol] ?? "").trim(), price: parsePrice(r[pCol]) ?? 0 }))
    .filter((r) => r.desc && r.price > 0);
}

function Index() {
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const added: Source[] = [];
    for (const f of Array.from(files)) {
      const wb = XLSX.read(await f.arrayBuffer());
      const rows = wb.SheetNames.flatMap((n) =>
        readSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n]!, { header: 1, raw: true })),
      );
      added.push({ id: crypto.randomUUID(), name: f.name.replace(/\.xlsx?$/i, ""), kind: "distribuidor", rows });
    }
    setSources((s) => [...s, ...added]);
  }

  async function importCatalog() {
    setLoading(true); setMsg("");
    try {
      const r = await fetch(CATALOG_URL, {
        method: "POST",
        headers: { apikey: CATALOG_KEY, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      const rows: Item[] = (data.products ?? [])
        .filter((p: any) => p.is_available !== false && p.price_cents > 0)
        .map((p: any) => ({ desc: `${p.name} ${p.screen_brand ?? ""}`, price: p.price_cents / 100 }));
      setSources((s) => [...s, { id: crypto.randomUUID(), name: "Catálogo online", kind: "distribuidor", rows }]);
      setMsg(`${rows.length} produtos importados do catálogo.`);
    } catch (e) {
      setMsg(`Não foi possível ler o catálogo (${String(e)}).`);
    } finally { setLoading(false); }
  }

  const update = (id: string, patch: Partial<Source>) =>
    setSources((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const table = useMemo(() => {
    const groups = new Map<string, { model: string; quality: string; cells: Record<string, { price: number; desc: string; brand: string }> }>();
    for (const src of sources) {
      for (const it of src.rows) {
        const p = parseDescription(it.desc, src.kind);
        if (!p.model) continue;
        const k = groupKey(p);
        const g = groups.get(k) ?? { model: p.model, quality: p.quality, cells: {} };
        const cur = g.cells[src.id];
        if (!cur || it.price < cur.price) g.cells[src.id] = { price: it.price, desc: it.desc, brand: p.brand };
        groups.set(k, g);
      }
    }
    const q = filter.trim().toLowerCase();
    return [...groups.values()]
      .filter((g) => Object.keys(g.cells).length > 0)
      .filter((g) => !q || `${g.model} ${g.quality}`.toLowerCase().includes(q))
      .sort((a, b) => Object.keys(b.cells).length - Object.keys(a.cells).length || a.model.localeCompare(b.model));
  }, [sources, filter]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-6">
        <h1 className="text-3xl font-bold tracking-tight">Cotação de Telas</h1>
        <p className="text-muted-foreground">Suba as planilhas e veja onde cada tela sai mais barata. O menor preço aparece em vermelho.</p>
      </header>

      <section className="space-y-4 px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Adicionar planilhas Excel
            <input type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button onClick={importCatalog} disabled={loading} className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
            {loading ? "Importando…" : "Importar catálogo online"}
          </button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>

        {sources.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className="w-full bg-transparent font-semibold outline-none" />
                <div className="mt-2 flex items-center gap-2">
                  <select value={s.kind} onChange={(e) => update(s.id, { kind: e.target.value as SourceKind })} className="rounded border border-input bg-background px-2 py-1">
                    <option value="concorrente">Concorrente</option>
                    <option value="distribuidor">Distribuidor</option>
                    <option value="distribuidor_dr">Distribuidor (linha DR)</option>
                  </select>
                  <span className="text-muted-foreground">{s.rows.length} itens</span>
                  <button onClick={() => setSources((x) => x.filter((y) => y.id !== s.id))} className="ml-auto text-muted-foreground hover:text-destructive">Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sources.length > 0 && (
          <input placeholder="Filtrar: ex. iPhone 11 OLED" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm" />
        )}

        {table.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2">Qualidade</th>
                  {sources.map((s) => (
                    <th key={s.id} className="px-3 py-2">
                      {s.name}
                      <div className="text-xs font-normal text-muted-foreground">{s.kind === "concorrente" ? "concorrente" : "fornecedor"}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((g) => {
                  const buy = sources.filter((s) => s.kind !== "concorrente").map((s) => g.cells[s.id]?.price).filter((p): p is number => p != null);
                  const min = buy.length ? Math.min(...buy) : null;
                  return (
                    <tr key={g.model + g.quality} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{g.model}</td>
                      <td className="px-3 py-2">{g.quality}</td>
                      {sources.map((s) => {
                        const c = g.cells[s.id];
                        const best = c && s.kind !== "concorrente" && c.price === min;
                        return (
                          <td key={s.id} title={c?.desc} className={`px-3 py-2 ${best ? "font-bold text-destructive" : ""}`}>
                            {c ? brl(c.price) : <span className="text-muted-foreground">—</span>}
                            {c?.brand && <span className="ml-1 rounded bg-muted px-1 text-xs text-muted-foreground">{c.brand}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhuma planilha carregada ainda. A planilha precisa ter uma coluna de descrição e uma de preço.</p>
        )}
      </section>
    </main>
  );
}
