import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, FileText, ShieldCheck, Upload, Users } from "lucide-react";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";

type Contact = {
  id: string;
  phone: string;
  consent: boolean;
};

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const hasInternationalPrefix = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  if (!digits || /^([0-9])\1+$/.test(digits)) return null;

  // Nigerian local mobile format: 080XXXXXXXX -> +23480XXXXXXXX.
  if (!hasInternationalPrefix && digits.length === 11 && digits.startsWith("0")) {
    digits = "234" + digits.slice(1);
  } else if (!hasInternationalPrefix && digits.startsWith("234") && digits.length === 13) {
    // Already supplied with Nigeria's country code.
  } else if (!hasInternationalPrefix) {
    return null;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("0")) return null;
  return "+" + digits;
}

function extractContacts(source: string): Contact[] {
  const candidates = source.match(/(?:\+|00)?\d(?:[\d\s().-]{5,}\d)?/g) ?? [];
  const unique = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) unique.add(normalized);
  }
  return [...unique].sort().map((phone) => ({
    id: phone,
    phone,
    consent: false,
  }));
}

function csvCell(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contact Intelligence — ChatB2K" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ContactIntelligencePage,
});

function ContactIntelligencePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [telegramInvite, setTelegramInvite] = useState("");
  const [busy, setBusy] = useState(false);

  const consentCount = useMemo(
    () => contacts.filter((contact) => contact.consent).length,
    [contacts],
  );

  async function importFile(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const content = await file.text();
      const extracted = extractContacts(content);
      setFilename(file.name);
      setContacts(extracted);
      if (!extracted.length) {
        setError("No plausible international phone numbers were found. WhatsApp exports often show participant names rather than phone numbers.");
      }
    } catch {
      setError("The file could not be read. Try a UTF-8 WhatsApp .txt export.");
    } finally {
      setBusy(false);
    }
  }

  function toggleConsent(id: string) {
    setContacts((current) =>
      current.map((contact) =>
        contact.id === id ? { ...contact, consent: !contact.consent } : contact,
      ),
    );
  }

  function exportCsv(consentedOnly = false) {
    const rows = contacts.filter((contact) => !consentedOnly || contact.consent);
    const content = [
      "phone_e164,format_status,telegram_contact_consent",
      ...rows.map((contact) =>
        [
          csvCell(contact.phone),
          csvCell("plausible_format_only"),
          csvCell(contact.consent ? "confirmed" : "not_recorded"),
        ].join(","),
      ),
    ].join("\r\n");
    downloadFile(
      consentedOnly ? "resofit-consented-contacts.csv" : "resofit-contacts.csv",
      content,
      "text/csv;charset=utf-8",
    );
  }

  function exportVcf() {
    const vcf = contacts
      .map((contact) =>
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          "FN:" + contact.phone,
          "TEL;TYPE=CELL:" + contact.phone,
          "NOTE:Consent " + (contact.consent ? "confirmed by operator" : "not recorded"),
          "END:VCARD",
        ].join("\r\n"),
      )
      .join("\r\n");
    downloadFile("resofit-contacts.vcf", vcf, "text/vcard;charset=utf-8");
  }

  const inviteLooksValid = /^https:\/\/(t\.me|telegram\.me)\//i.test(telegramInvite.trim());

  return (
    <SiteShell>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-20">
        <SectionHeading
          eyebrow="ChatB2K · Audience Operations"
          title="Contact Intelligence"
          sub="Extract, normalize, deduplicate and export phone numbers from WhatsApp text exports. Processing happens in this browser session."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Metric label="Unique contacts" value={contacts.length.toLocaleString()} />
          <Metric label="Consent confirmed" value={consentCount.toLocaleString()} />
          <Metric label="Consent not recorded" value={(contacts.length - consentCount).toLocaleString()} />
        </div>

        <section className="glass rounded-md p-5 sm:p-7 mt-7">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-[var(--glass-border)] p-3 text-gold">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-2xl">Import WhatsApp export</h2>
              <p className="text-xs text-muted-foreground mt-1">TXT, CSV or VCF · UTF-8 recommended</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.vcf,text/plain,text/csv,text/vcard"
            className="sr-only"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-sm bg-gold-gradient px-5 py-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {busy ? "Reading file…" : "Choose export file"}
            </button>
            {contacts.length > 0 && (
              <button
                type="button"
                onClick={() => { setContacts([]); setFilename(""); setError(""); }}
                className="rounded-sm border border-[var(--glass-border)] px-5 py-3 text-sm text-foreground/80 hover:text-gold"
              >
                Clear session
              </button>
            )}
          </div>
          {filename && <p className="mt-3 text-xs text-muted-foreground">Loaded: {filename}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-amber-300">{error}</p>}
        </section>

        <section className="glass rounded-md p-5 sm:p-7 mt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">Contact review</h2>
              <p className="text-xs text-muted-foreground mt-1">A valid-looking E.164 number is not proof that a SIM is active or belongs to the named person.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={!contacts.length} onClick={() => exportCsv()} className="inline-flex items-center gap-2 rounded-sm border border-[var(--glass-border)] px-3 py-2 text-xs disabled:opacity-40">
                <Download className="h-4 w-4" /> CSV
              </button>
              <button disabled={!contacts.length} onClick={exportVcf} className="inline-flex items-center gap-2 rounded-sm border border-[var(--glass-border)] px-3 py-2 text-xs disabled:opacity-40">
                <Download className="h-4 w-4" /> VCF
              </button>
            </div>
          </div>

          {contacts.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-3 h-7 w-7 opacity-50" />
              Import a WhatsApp export to review extracted numbers.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-[var(--glass-border)] text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <tr><th className="py-3 pr-4">Phone (E.164)</th><th className="py-3 pr-4">Format check</th><th className="py-3">Consent to Telegram contact</th></tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-[var(--glass-border)]/60">
                      <td className="py-3 pr-4 font-mono">{contact.phone}</td>
                      <td className="py-3 pr-4"><span className="text-emerald-300">Plausible format</span></td>
                      <td className="py-3">
                        <label className="inline-flex items-center gap-2 text-xs text-foreground/80">
                          <input type="checkbox" checked={contact.consent} onChange={() => toggleConsent(contact.id)} />
                          Consent confirmed separately
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {contacts.length > 0 && (
            <button onClick={() => exportCsv(true)} disabled={!consentCount} className="mt-5 rounded-sm border border-emerald-400/30 px-4 py-2.5 text-xs text-emerald-200 disabled:opacity-40">
              Export consent-confirmed CSV ({consentCount})
            </button>
          )}
        </section>

        <section className="glass rounded-md p-5 sm:p-7 mt-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-gold" />
            <h2 className="font-display text-2xl">Telegram invitation handoff</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your Telegram group or channel invite URL to prepare a voluntary-join handoff. This tool does not add people to Telegram, send messages, or bypass Telegram membership controls.
          </p>
          <input
            value={telegramInvite}
            onChange={(event) => setTelegramInvite(event.target.value)}
            placeholder="https://t.me/your_group_invite"
            className="mt-4 w-full rounded-sm border border-[var(--glass-border)] bg-[var(--ink)] px-4 py-3 text-sm"
          />
          {telegramInvite && (
            <p className={inviteLooksValid ? "mt-2 text-xs text-emerald-300" : "mt-2 text-xs text-amber-300"}>
              {inviteLooksValid ? "Telegram URL format accepted. Share it only with people who opted in." : "Enter a valid https://t.me/… invite URL."}
            </p>
          )}
          <button
            type="button"
            disabled={!inviteLooksValid || !consentCount}
            onClick={() => navigator.clipboard.writeText(telegramInvite.trim())}
            className="mt-4 rounded-sm bg-gold-gradient px-5 py-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-40"
          >
            Copy invite link for opted-in outreach
          </button>
        </section>

        <p className="mt-6 text-xs leading-6 text-muted-foreground">
          Privacy boundary: this first branch version processes the selected file locally and does not upload the source export or extracted contacts to ResoFit, Google Drive or Dropbox. Cloud backup and persistent consent records remain separate integration work and are not represented as active.
        </p>
      </main>
    </SiteShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-md p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl text-gold-gradient">{value}</div>
    </div>
  );
}
