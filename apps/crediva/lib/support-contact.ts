export type CredoSupportContext = "consent-link" | "expired-consent-link";

export interface CredoSupportContact {
  phoneDisplay: string;
  phoneHref: string;
  whatsappHref: string;
  supportHref: string;
}

/** The firm a consumer contacts for help — resolved server-side from the company profile. */
export interface CredoSupportFirm {
  /** Short brand name used in the pre-filled WhatsApp greeting, e.g. "Zenowethu". */
  shortName: string;
  /** Display phone, e.g. "081 747 7616". */
  phone: string;
  /** Support mailbox. */
  email: string;
}

/** Digits-only E.164 form of a South African number: "081 747 7616" → "27817477616". */
export function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("27")) return digits;
  if (digits.startsWith("0")) return `27${digits.slice(1)}`;
  return digits;
}

const CONTEXT_MESSAGES: Record<CredoSupportContext, (firm: string) => string> = {
  "consent-link": (firm) => `Hi ${firm}, I need help with my Credo consent link.`,
  "expired-consent-link": (firm) => `Hi ${firm}, my Credo consent link is no longer active. Please send me a new link.`,
};

export function getCredoSupportContact(
  context: CredoSupportContext = "consent-link",
  firm: CredoSupportFirm,
): CredoSupportContact {
  const message = CONTEXT_MESSAGES[context](firm.shortName);
  const subject =
    context === "expired-consent-link"
      ? "Credo consent link support - expired link"
      : "Credo consent link support";
  const e164 = toE164Digits(firm.phone);

  return {
    phoneDisplay: firm.phone,
    phoneHref: `tel:+${e164}`,
    whatsappHref: `https://wa.me/${e164}?text=${encodeURIComponent(message)}`,
    supportHref: `mailto:${firm.email}?subject=${encodeURIComponent(subject)}`,
  };
}
