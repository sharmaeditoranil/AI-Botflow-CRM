import { describe, expect, it } from "vitest";
import { parseAmount, summarizePayments } from "./payments";

describe("summarizePayments", () => {
  it("unpaid, partial, paid, overpaid", () => {
    expect(summarizePayments(10000, 0)).toMatchObject({ due: 10000, status: "unpaid", percent: 0 });
    expect(summarizePayments(10000, 2500)).toMatchObject({ received: 2500, due: 7500, status: "partial", percent: 25 });
    expect(summarizePayments(10000, 10000)).toMatchObject({ due: 0, status: "paid", percent: 100 });
    expect(summarizePayments(10000, 12000)).toMatchObject({ due: 0, extra: 2000, status: "overpaid", percent: 100 });
  });

  it("deal without a value", () => {
    expect(summarizePayments(0, 0).status).toBe("none");
    expect(summarizePayments(null, 500)).toMatchObject({ status: "overpaid", extra: 500 });
  });
});

describe("parseAmount", () => {
  it("accepts grouped and decimal amounts", () => {
    expect(parseAmount("5,000")).toBe(5000);
    expect(parseAmount(" 2500.505 ")).toBe(2500.51);
  });
  it("rejects zero, negative and junk", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});
