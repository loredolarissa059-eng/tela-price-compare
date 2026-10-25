import { useState } from "react";

export interface ReportCell { price: number; desc: string; brand: string }
export interface ReportRow { id: string; model: string; quality: string; cells: Record<string, ReportCell> }
export interface ReportSource { id: string; name: string; dr: boolean }

interface Props {
  competitor: ReportSource | null;
  suppliers: ReportSource[];
  baseRows: ReportRow[];
  extraRows: ReportRow[];
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function minOf(r: ReportRow, suppliers: ReportSource[]) {
  const b = suppliers.map((s) => r.cells[s.id]?.price).filter((p): p is number => p != null);
  return b.length ? Math.min(...b) : null;
}

export function Report({ competitor, suppliers, baseRows, extraRows }: Props) {
  const [busy, setBusy] = useState(false);
  const now = new Date().toLocaleString("pt-BR");

  const head = [
    "#", "Modelo", "Qualidade",
    ...(competitor ? [`Concorrente\n${competitor.name}`] : []),
    ...suppliers.map((s) => `Fornecedor${s.dr ? " DR" : ""}\n${s.name}`),
    ...(competitor && suppliers.length ? ["Margem"] : []),
  ];

  const toBody = (rows: ReportRow[], withComp: boolean) =>
    rows.map((r, i) => {
      const min = minOf(r, suppliers);
      const c = competitor ? r.cells[competitor.id] : undefined;
      const fmt = (x?: ReportCell) => (x ? `${brl(x.price)}${x.brand ? ` (${x.brand})` : ""}\n${x.desc}` : "—");
      return {
        min,
        cells: [
          String(i + 1), r.model, r.quality,
          ...(competitor ? [withComp ? fmt(c) : "—"] : []),
          ...suppliers.map((s) => fmt(r.cells[s.id])),
          ...(competitor && suppliers.length ? [c && min != null ? brl(c.price - min) : "—"] : []),
        ],
        best: suppliers.map((s) => r.cells[s.id]?.price === min && min != null),
      };
    });

  async function exportPdf() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text("Relatório comparativo de telas", 40, 40);
      doc.setFontSize(9);
      doc.text(`Gerado em ${now}`, 40, 56);
      const supStart = 3 + (competitor ? 1 : 0);
      const draw = (title: string, rows: ReturnType<typeof toBody>, startY: number) => {
        doc.setFontSize(11);
        doc.text(title, 40, startY);
        autoTable(doc, {
          startY: startY + 6,
          head: [head],
          body: rows.map((r) => r.cells),
          styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak", valign: "top" },
          headStyles: { fillColor: [40, 40, 40] },
          columnStyles: { 0: { cellWidth: 22 } },
          margin: { left: 40, right: 40, bottom: 30 },
          didParseCell: (d) => {
            if (d.section !== "body") return;
            const si = d.column.index - supStart;
            if (si >= 0 && si < suppliers.length && rows[d.row.index]?.best[si]) {
              d.cell.styles.textColor = [200, 0, 0];
              d.cell.styles.fontStyle = "bold";
            }
          },
          didDrawPage: () => {
            doc.setFontSize(8);
            const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
            doc.text(`Página ${doc.getNumberOfPages()}`, w - 80, h - 14);
          },
        });
        return (doc as any).lastAutoTable.finalY as number;
      };
      let y = 80;
      if (competitor) y = draw("Lista do concorrente (ordem original)", toBody(baseRows, true), y) + 30;
      if (extraRows.length) {
        if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 40; }
        draw(competitor ? "Itens disponíveis apenas nos fornecedores" : "Itens dos fornecedores", toBody(extraRows, false), y);
      }
      doc.save(`relatorio-telas-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setBusy(false); }
  }

  const empty = !baseRows.length && !extraRows.length;

  const renderTable = (rows: ReportRow[], withComp: boolean) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>{head.map((h) => <th key={h} className="whitespace-pre-line px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {toBody(rows, withComp).map((r, i) => (
            <tr key={rows[i]!.id + i} className="border-t border-border align-top">
              {r.cells.map((c, j) => {
                const si = j - (3 + (competitor ? 1 : 0));
                const red = si >= 0 && si < suppliers.length && r.best[si];
                return <td key={j} className={`whitespace-pre-line px-3 py-2 ${red ? "font-bold text-destructive" : ""}`}>{c}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="space-y-4 px-6 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold">Relatório comparativo</h2>
          <p className="text-sm text-muted-foreground">Gerado em {now}</p>
        </div>
        <button onClick={exportPdf} disabled={busy || empty} className="ml-auto rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Gerando…" : "Exportar PDF"}
        </button>
      </div>
      {empty ? (
        <p className="text-muted-foreground">Envie as planilhas na aba Comparação para gerar o relatório.</p>
      ) : (
        <>
          {competitor && (<><h3 className="text-lg font-semibold">Lista do concorrente (ordem original)</h3>{renderTable(baseRows, true)}</>)}
          {extraRows.length > 0 && (<><h3 className="text-lg font-semibold">{competitor ? "Itens disponíveis apenas nos fornecedores" : "Itens dos fornecedores"}</h3>{renderTable(extraRows, false)}</>)}
        </>
      )}
    </section>
  );
}
