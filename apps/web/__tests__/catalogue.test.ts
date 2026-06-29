import { describe, it, expect } from "@jest/globals";
import { parseCatalogueText } from "@/lib/catalogue";

describe("parseCatalogueText", () => {
  it("parses a CSV with a header row", () => {
    const csv = "Name,Price,Description\nChocolate Cake,650,Rich and moist\nVanilla Cake,550,Classic";
    const products = parseCatalogueText(csv);
    expect(products).toHaveLength(2);
    expect(products[0]).toEqual({ name: "Chocolate Cake", price: 650, description: "Rich and moist" });
    expect(products[1].name).toBe("Vanilla Cake");
    expect(products[1].price).toBe(550);
  });

  it("handles rupee symbols and commas in prices", () => {
    const csv = "Name,Price\nDeluxe Hamper,\"₹1,499\"\nMini Box,Rs 299";
    const products = parseCatalogueText(csv);
    expect(products[0].price).toBe(1499);
    expect(products[1].price).toBe(299);
  });

  it("parses 'Name - price' lines without a header", () => {
    const products = parseCatalogueText("Brownie - 199\nCookie Jar : 349");
    expect(products[0]).toMatchObject({ name: "Brownie", price: 199 });
    expect(products[1]).toMatchObject({ name: "Cookie Jar", price: 349 });
  });

  it("honours quoted fields with embedded commas", () => {
    const csv = 'Name,Price,Description\n"Cake, large",999,"Serves 8, eggless"';
    const products = parseCatalogueText(csv);
    expect(products[0].name).toBe("Cake, large");
    expect(products[0].description).toBe("Serves 8, eggless");
  });

  it("returns an empty array for blank input", () => {
    expect(parseCatalogueText("")).toEqual([]);
    expect(parseCatalogueText("   \n  ")).toEqual([]);
  });

  it("caps at 100 products", () => {
    const rows = Array.from({ length: 150 }, (_, i) => `Item ${i},${i + 1}`).join("\n");
    expect(parseCatalogueText("Name,Price\n" + rows).length).toBe(100);
  });
});
