export type ExtractedContact = {
  id: string;
  phone: string;
  consent: boolean;
};

export function normalizePhone(raw: string): string | null {
  const input = raw.trim();
  const international = input.startsWith("+") || input.startsWith("00");
  let digits = input.replace(/\D/g, "");

  if (input.startsWith("00")) digits = digits.slice(2);
  if (!digits || /^([0-9])\1+$/.test(digits)) return null;

  if (!international) {
    if (digits.startsWith("0") && digits.length === 11) {
      // Nigerian mobile national numbers use a 10-digit NSN after the trunk zero.
      if (!/[789]/.test(digits[1])) return null;
      digits = "234" + digits.slice(1);
    } else if (digits.startsWith("234") && digits.length === 13) {
      if (!/[789]/.test(digits[3])) return null;
    } else {
      return null;
    }
  }

  // E.164 shape: 8–15 digits, with a non-zero country-code first digit.
  if (digits.length < 8 || digits.length > 15 || digits[0] === "0") return null;
  return "+" + digits;
}

export function extractContacts(source: string): ExtractedContact[] {
  const candidates = source.matchAll(
    /(?:^|[^\p{L}\p{N}])((?:\+|00)?\d(?:[\d \t().-]{4,}\d))(?![\p{L}\p{N}])/gu,
  );
  const unique = new Set<string>();

  for (const match of candidates) {
    const normalized = normalizePhone(match[1]);
    if (normalized) unique.add(normalized);
  }

  return [...unique].sort().map((phone) => ({
    id: phone,
    phone,
    consent: false,
  }));
}
