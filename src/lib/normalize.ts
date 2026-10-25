export type SourceKind = "concorrente" | "distribuidor" | "distribuidor_dr";

export interface Parsed {
  model: string;
  quality: string;
  brand: string; // Diamond, Gold, DR, Vibe...
  aro: boolean;
}

const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const NOISE =
  /\b(FRONTAL|TELA|DISPLAY|LCD|MODULO|COM|SEM|PRETO|PRETA|BRANCO|BRANCA|AZUL|VERMELHO|DOURADO|ROSA|VERDE|ROXO|AMARELO|PREMIUM|NOVO|NOVA|PECA|APPLE|SAMSUNG|GALAXY|MOTOROLA|MOTO|PARA|DE|CI|ORIGINAL|NACIONAL|IMPORTADO)\b/g;

export const NATIVE = "Padrão (nativa)";

export function parseDescription(desc: string, kind: SourceKind): Parsed {
  let s = " " + strip(desc).replace(/[-_,;()[\]]/g, " ") + " ";

  // aro: "c/aro", "c/ aro", "com aro" = com aro; "s/aro" ou nada = sem aro
  const aro = /\bC\s*\/\s*ARO\b|\bCOM\s+ARO\b/.test(s);
  s = s.replace(/\b[CS]\s*\/\s*ARO\b|\b(COM|SEM)\s+ARO\b|\bARO\b/g, " ");

  // marca / linha
  let brand = "";
  if (/\bDIAMOND\b/.test(s)) brand = "Diamond";
  else if (/\bGOLD\b/.test(s)) brand = "Gold";
  else if (/\bVIBE\b/.test(s)) brand = "Vibe";
  if (kind === "distribuidor_dr" && /\bDR\b/.test(s)) brand = "DR";
  s = s.replace(/\b(DIAMOND|GOLD|DR|VIBE)\b/g, " ");

  // qualidade
  let quality = "";
  if (kind === "distribuidor_dr" && /\bSOFT\s+ORIGINAL\b/.test(s)) {
    quality = "Soft OLED";
    s = s.replace(/\bSOFT\s+ORIGINAL\b/g, " ");
  } else if (/\bSOFT\s*OLED\b/.test(s)) {
    quality = "Soft OLED";
    s = s.replace(/\bSOFT\s*OLED\b/g, " ");
  } else if (/\bHARD\s*OLED\b/.test(s)) {
    quality = "Hard OLED";
    s = s.replace(/\bHARD\s*OLED\b/g, " ");
  } else if (/\bOLED\b/.test(s)) {
    quality = "OLED";
    s = s.replace(/\bOLED\b/g, " ");
  } else if (/\bINCELL\b|\bIN\s+CELL\b/.test(s)) {
    quality = "Incell";
    s = s.replace(/\bIN\s*CELL\b/g, " ");
  }
  // FHD / sem qualidade = qualidade nativa do próprio aparelho
  s = s.replace(/\b(FHD|HD)\b/g, " ");
  if (!quality) quality = NATIVE;

  // modelo
  s = s.replace(NOISE, " ");
  s = s.replace(/\s*\/\s*/g, "/").replace(/^\/+|\/+$/g, "");
  if (s.includes("/")) {
    // lista de modelos compatíveis: ignora ordem e sufixo 4G/5G
    const parts = s.replace(/\b[45]G\b/g, " ").split("/").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    s = [...new Set(parts)].sort().join("/");
  }
  s = s.replace(/\b(\d{1,2})G\b/g, "$1");
  s = s.replace(/\bIPHONE\s*(\d)/g, "IPHONE $1");
  s = s.replace(/\bIP\s*(\d)/g, "IPHONE $1");
  s = s.replace(/\bPROMAX\b/g, "PRO MAX");
  s = s.replace(/\s+/g, " ").trim().replace(/^\/|\/$/g, "").trim();
  const model = s
    .split(" ")
    .filter(Boolean)
    .map((w) =>
      w === "IPHONE" ? "iPhone" : /\d/.test(w) || w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase(),
    )
    .join(" ");
  return { model, quality, brand, aro };
}

export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[^\d,.-]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? n : null;
}

/** Vibe (concorrente) equivale à linha DR do fornecedor. */
const line = (p: Parsed) => (p.brand === "DR" || p.brand === "Vibe" ? "DR" : "");

export const groupKey = (p: Parsed) =>
  `${p.model.toUpperCase()}|${p.quality}|${p.aro ? "ARO" : ""}|${line(p)}`;
