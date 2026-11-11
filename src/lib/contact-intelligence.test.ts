import { describe, expect, it } from "vitest";
import { extractContacts, normalizePhone } from "@/lib/contact-intelligence";

describe("normalizePhone", () => {
  it("normalizes Nigerian local mobile numbers to E.164", () => {
    expect(normalizePhone("08031234567")).toBe("+2348031234567");
    expect(normalizePhone("0810 123 4567")).toBe("+2348101234567");
  });

  it("normalizes an already international Nigerian number", () => {
    expect(normalizePhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("002348031234567")).toBe("+2348031234567");
  });

  it("accepts plausible international E.164-shaped values", () => {
    expect(normalizePhone("+1 202 555 0123")).toBe("+12025550123");
  });

  it("rejects dates, short values, repeated digits and malformed local values", () => {
    expect(normalizePhone("2026-11-11")).toBeNull();
    expect(normalizePhone("17:20")).toBeNull();
    expect(normalizePhone("11111111111")).toBeNull();
    expect(normalizePhone("080123")).toBeNull();
    expect(normalizePhone("06031234567")).toBeNull();
    expect(normalizePhone("8031234567")).toBeNull();
  });
});

describe("extractContacts", () => {
  it("extracts and deduplicates numbers while ignoring timestamps", () => {
    const exportText = [
      "11/11/2026, 17:20 - A: Call me on 08031234567",
      "11/11/2026, 17:21 - B: +234 803 123 4567",
      "2026-11-11 17:22",
    ].join("\n");

    expect(extractContacts(exportText)).toEqual([
      {
        id: "+2348031234567",
        phone: "+2348031234567",
        consent: false,
      },
    ]);
  });

  it("does not extract digits embedded in words", () => {
    expect(extractContacts("member08031234567suffix")).toEqual([]);
  });

  it("does not infer phone numbers from date and time text", () => {
    expect(extractContacts("2026-11-11 17:20")).toEqual([]);
  });
});
