import { describe, it, expect } from "vitest";
import { parseDescription, parsePrice, groupKey } from "@/lib/normalize";

describe("normalização", () => {
  it("iPhone 11 OLED", () => {
    expect(parseDescription("TELA FRONTAL IPHONE 11 OLED PRETO", "distribuidor")).toMatchObject({
      model: "iPhone 11",
      quality: "OLED",
    });
  });
  it("Soft Original no fornecedor DR vira Soft OLED", () => {
    expect(parseDescription("IPHONE 11 SOFT ORIGINAL", "distribuidor_dr").quality).toBe("Soft OLED");
  });
  it("DR é linha própria; sem DR não é", () => {
    expect(parseDescription("DR IPHONE 11", "distribuidor_dr").brand).toBe("DR");
    expect(parseDescription("IPHONE 11", "distribuidor_dr").brand).toBe("");
  });
  it("concorrente sem FHD equivale a FHD", () => {
    expect(parseDescription("iPhone 11", "concorrente").quality).toBe(
      parseDescription("iPhone 11 FHD", "distribuidor").quality,
    );
  });
  it("Diamond e Gold são marcas", () => {
    const p = parseDescription("Frontal iPhone 11 Incell Diamond", "distribuidor");
    expect(p).toMatchObject({ model: "iPhone 11", quality: "Incell", brand: "Diamond" });
  });
  it("Samsung s/aro do concorrente = fornecedor sem menção a aro", () => {
    expect(groupKey(parseDescription("Samsung a02s/a03/a03s/a04e s/aro", "concorrente"))).toBe(
      groupKey(parseDescription("Frontal a02s/a03/a03s/a04e", "distribuidor")),
    );
  });
  it("c/ aro do concorrente = com aro do fornecedor, e difere de sem aro", () => {
    const c = groupKey(parseDescription("Samsung a02s/a03/a03s/a04e c/ aro", "concorrente"));
    expect(c).toBe(groupKey(parseDescription("a02s/a03/a03s/a04e com aro", "distribuidor")));
    expect(c).not.toBe(groupKey(parseDescription("a02s/a03/a03s/a04e", "distribuidor")));
  });
  it("Vibe compara com DR, não com tela comum", () => {
    const v = groupKey(parseDescription("iPhone 11 Vibe", "concorrente"));
    expect(v).toBe(groupKey(parseDescription("DR iPhone 11", "distribuidor_dr")));
    expect(v).not.toBe(groupKey(parseDescription("iPhone 11", "distribuidor_dr")));
  });
  it("sem qualidade não vira FHD", () => {
    expect(parseDescription("Frontal a02s", "distribuidor").quality).not.toMatch(/FHD/);
  });
  it("lista de modelos em outra ordem e com 5G é a mesma peça", () => {
    expect(groupKey(parseDescription("Moto G14/G54/G55/G64 Vibe", "concorrente"))).toBe(
      groupKey(parseDescription("DR moto g14/g54/g64 5g/g55 5g", "distribuidor_dr")),
    );
  });
  it("preço em reais", () => {
    expect(parsePrice("R$ 1.234,50")).toBe(1234.5);
  });
});
