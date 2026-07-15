export type CredoSupportContext = "consent-link" | "expired-consent-link";

export interface CredoSupportContact {
  phoneDisplay: string;
  phoneHref: string;
  whatsappHref: string;
  supportHref: string;
}

const SUPPORT_PHONE_DISPLAY = "081 747 7616";
const SUPPORT_PHONE_E164 = "+27817477616";
const SUPPORT_WHATSAPP_NUMBER = "27817477616";
const SUPPORT_EMAIL = "support@zenowethu.co.za";

const CONTEXT_MESSAGES: Record<CredoSupportContext, string> = {
  "consent-link": "Hi Zenowethu, I need help with my Credo consent link.",
  "expired-consent-link": "Hi Zenowethu, my Credo consent link is no longer active. Please send me a new link.",
};

export function getCredoSupportContact(context: CredoSupportContext = "consent-link"): CredoSupportContact {
  const message = CONTEXT_MESSAGES[context];
  const subject =
    context === "expired-consent-link"
      ? "Credo consent link support - expired link"
      : "Credo consent link support";

  return {
    phoneDisplay: SUPPORT_PHONE_DISPLAY,
    phoneHref: `tel:${SUPPORT_PHONE_E164}`,
    whatsappHref: `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    supportHref: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`,
  };
}
