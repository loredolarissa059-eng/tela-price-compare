import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
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
interface Source { id: string; name: string; role: "concorrente" | "fornecedor"; dr: boolean; rows: Item[] }

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

type Role = "concorrente" | "fornecedor";
const kindOf = (s: Source): SourceKind => (s.role === "concorrente" ? "concorrente" : s.dr ? "distribuidor_dr" : "distribuidor");

async function readFile(f: File): Promise<Item[]> {
  const wb = XLSX.read(await f.arrayBuffer());
  return wb.SheetNames.flatMap((n) =>
    readSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n]!, { header: 1, raw: true })),
  );
}

function Index() {
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const competitor = sources.find((s) => s.role === "concorrente") ?? null;
  const suppliers = sources.filter((s) => s.role === "fornecedor");

  async function addFiles(files: FileList | null, role: Role, replaceId?: string) {
    if (!files?.length) return;
    setMsg("");
    const list = role === "concorrente" ? [files[0]!] : Array.from(files);
    const added: Source[] = [];
    for (const f of list) {
      try {
        const rows = await readFile(f);
        if (!rows.length) { setMsg(`"${f.name}" não tem linhas com descrição e preço.`); continue; }
        added.push({ id: crypto.randomUUID(), name: f.name.replace(/\.(xlsx?|csv)$/i, ""), role, dr: false, rows });
      } catch { setMsg(`Não foi possível ler "${f.name}".`); }
    }
    if (!added.length) return;
    setSources((s) => {
      if (role === "concorrente") return [...s.filter((x) => x.role !== "concorrente"), added[0]!];
      if (replaceId) {
        const old = s.find((x) => x.id === replaceId);
        return s.map((x) => (x.id === replaceId ? { ...added[0]!, dr: old?.dr ?? false } : x));
      }
      return [...s, ...added];
    });
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
      setSources((s) => [...s, { id: crypto.randomUUID(), name: "Catálogo online", role: "fornecedor", dr: false, rows }]);
      setMsg(`${rows.length} produtos importados do catálogo como fornecedor.`);
    } catch (e) {
      setMsg(`Não foi possível ler o catálogo (${String(e)}).`);
    } finally { setLoading(false); }
  }

  const update = (id: string, patch: Partial<Source>) =>
    setSources((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setSources((s) => s.filter((x) => x.id !== id));

  
  type Cell = { price: number; desc: string; brand: string };
  type Row = { id: string; model: string; quality: string; cells: Record<string, Cell> };
  const { baseRows, extraRows } = useMemo(() => {
    const groups = new Map<string, Row>();
    for (const src of suppliers) {
      for (const it of src.rows) {
        const p = parseDescription(it.desc, kindOf(src));
        if (!p.model) continue;
        const k = groupKey(p);
        const g = groups.get(k) ?? { id: k, model: p.model, quality: p.quality + (p.aro ? " · com aro" : "") + (p.brand === "DR" ? " · DR" : ""), cells: {} };
        const cur = g.cells[src.id];
        if (!cur || it.price < cur.price) g.cells[src.id] = { price: it.price, desc: it.desc, brand: p.brand };
        groups.set(k, g);
      }
    }
    const q = filter.trim().toLowerCase();
    const match = (r: Row) => !q || `${r.model} ${r.quality}`.toLowerCase().includes(q);
    if (!competitor) {
      const all = [...groups.values()].sort((a, b) => Object.keys(b.cells).length - Object.keys(a.cells).length || a.model.localeCompare(b.model));
      return { baseRows: [] as Row[], extraRows: all.filter(match) };
    }
    const used = new Set<string>();
    const base: Row[] = competitor.rows.map((it, i) => {
      const p = parseDescription(it.desc, "concorrente");
      const own = { price: it.price, desc: it.desc, brand: p.brand };
      if (!p.model) return { id: `c${i}`, model: it.desc, quality: "—", cells: { [competitor.id]: own } };
      const k = groupKey(p);
      used.add(k);
      return { id: `c${i}`, model: p.model, quality: p.quality + (p.aro ? " · com aro" : "") + (p.brand === "Vibe" ? " · Vibe" : ""), cells: { ...(groups.get(k)?.cells ?? {}), [competitor.id]: own } };
    });
    const extra = [...groups.values()].filter((g) => !used.has(g.id)).sort((a, b) => a.model.localeCompare(b.model));
    return { baseRows: base.filter(match), extraRows: extra.filter(match) };
  }, [competitor, suppliers, filter]);
  const table = [...baseRows, ...extraRows];

  const warnings: string[] = [];
  if (!competitor) warnings.push("Sem planilha do concorrente: não há lista-base, por isso a tabela mostra só os fornecedores.");
  if (!suppliers.length) warnings.push("Adicione pelo menos uma planilha de fornecedor para saber onde comprar mais barato.");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-6">
        <h1 className="text-3xl font-bold tracking-tight">Cotação de Telas</h1>
        <p className="text-muted-foreground">Envie a planilha do concorrente e as dos seus fornecedores. O menor preço de compra aparece em vermelho.</p>
      </header>

      <section className="grid gap-6 px-6 py-6 lg:grid-cols-2">
        {/* Concorrente */}
        <div className="rounded-xl border-2 border-secondary bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">1</span>
            <h2 className="text-xl font-semibold">Planilha do concorrente</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Envie uma única planilha com os preços de venda do concorrente. Ela serve de referência e não entra na disputa de menor preço.</p>
          {competitor ? (
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <input value={competitor.name} onChange={(e) => update(competitor.id, { name: e.target.value })} className="w-full bg-transparent font-semibold outline-none" />
              <div className="mt-2 flex items-center gap-3">
                <span className="text-muted-foreground">{competitor.rows.length} itens</span>
                <label className="ml-auto cursor-pointer text-primary hover:underline">
                  Substituir
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { addFiles(e.target.files, "concorrente"); e.target.value = ""; }} />
                </label>
                <button onClick={() => remove(competitor.id)} className="text-muted-foreground hover:text-destructive">Remover</button>
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input px-4 py-8 text-sm hover:bg-accent">
              <span className="font-medium">Enviar planilha do concorrente</span>
              <span className="text-muted-foreground">Excel (.xlsx, .xls) ou .csv</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { addFiles(e.target.files, "concorrente"); e.target.value = ""; }} />
            </label>
          )}
        </div>

        {/* Fornecedores */}
        <div className="rounded-xl border-2 border-primary bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">2</span>
            <h2 className="text-xl font-semibold">Planilhas dos meus fornecedores</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Envie uma ou mais planilhas de distribuidores. Marque "Linha DR" no fornecedor que trabalha com telas DR.</p>
          <div className="space-y-2">
            {suppliers.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className="w-full bg-transparent font-semibold outline-none" />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={s.dr} onChange={(e) => update(s.id, { dr: e.target.checked })} /> Linha DR
                  </label>
                  <span className="text-muted-foreground">{s.rows.length} itens</span>
                  <label className="ml-auto cursor-pointer text-primary hover:underline">
                    Substituir
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { addFiles(e.target.files, "fornecedor", s.id); e.target.value = ""; }} />
                  </label>
                  <button onClick={() => remove(s.id)} className="text-muted-foreground hover:text-destructive">Remover</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              + Adicionar fornecedor
              <input type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={(e) => { addFiles(e.target.files, "fornecedor"); e.target.value = ""; }} />
            </label>
            <button onClick={importCatalog} disabled={loading} className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
              {loading ? "Importando…" : "Importar catálogo online"}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4 px-6 pb-8">
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        {sources.length > 0 && warnings.map((w) => (
          <p key={w} className="rounded-md border border-border bg-muted px-3 py-2 text-sm">⚠ {w}</p>
        ))}

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
                  {competitor && (
                    <th className="border-x border-border bg-secondary/40 px-3 py-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Concorrente</div>
                      {competitor.name}
                    </th>
                  )}
                  {suppliers.map((s) => (
                    <th key={s.id} className="px-3 py-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Fornecedor{s.dr ? " · DR" : ""}</div>
                      {s.name}
                    </th>
                  ))}
                  {competitor && suppliers.length > 0 && <th className="px-3 py-2">Melhor compra vs concorrente</th>}
                </tr>
              </thead>
              <tbody>
                {[...baseRows.map((g) => ({ g, extra: false })), ...extraRows.map((g) => ({ g, extra: true }))].map(({ g, extra }, idx) => {
                  const buy = suppliers.map((s) => g.cells[s.id]?.price).filter((p): p is number => p != null);
                  const min = buy.length ? Math.min(...buy) : null;
                  const comp = competitor ? g.cells[competitor.id] : undefined;
                  const cell = (s: Source, isComp: boolean) => {
                    const c = g.cells[s.id];
                    const best = !isComp && c && c.price === min;
                    return (
                      <td key={s.id} title={c?.desc} className={`px-3 py-2 ${isComp ? "border-x border-border bg-secondary/20" : ""} ${best ? "font-bold text-destructive" : ""}`}>
                        {c ? brl(c.price) : <span className="text-muted-foreground">—</span>}
                        {c?.brand && <span className="ml-1 rounded bg-muted px-1 text-xs text-muted-foreground">{c.brand}</span>}
                      </td>
                    );
                  };
                  const nCols = 2 + (competitor ? 1 : 0) + suppliers.length + (competitor && suppliers.length > 0 ? 1 : 0);
                  const showHeader = extra && competitor && idx === baseRows.length;
                  return (
                    <Fragment key={g.id + (extra ? "x" : "")}>
                    {showHeader && (
                      <tr className="border-t-2 border-primary bg-muted">
                        <td colSpan={nCols} className="px-3 py-2 font-semibold">Itens disponíveis apenas nos fornecedores</td>
                      </tr>
                    )}
                    <tr className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{g.model}</td>
                      <td className="px-3 py-2">{g.quality}</td>
                      {competitor && cell(competitor, true)}
                      {suppliers.map((s) => cell(s, false))}
                      {competitor && suppliers.length > 0 && (
                        <td className="px-3 py-2 text-muted-foreground">
                          {comp && min != null ? `${brl(comp.price - min)} de margem` : "—"}
                        </td>
                      )}
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhuma planilha carregada ainda. Cada planilha precisa ter uma coluna de descrição e uma de preço.</p>
        )}
      </section>
    </main>
  );
}
