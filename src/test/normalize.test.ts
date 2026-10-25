import { describe, it, expect } from "vitest";
import { parseDescription, parsePrice } from "@/lib/normalize";

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
  it("preço em reais", () => {
    expect(parsePrice("R$ 1.234,50")).toBe(1234.5);
  });
});
