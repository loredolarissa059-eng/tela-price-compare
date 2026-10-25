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

