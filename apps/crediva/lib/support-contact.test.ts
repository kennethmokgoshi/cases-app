import { describe, expect, it } from "vitest";

import { getCredoSupportContact, toE164Digits } from "./support-contact";

const ZENOWETHU = { shortName: "Zenowethu", phone: "081 747 7616", email: "support@zenowethu.co.za" };

describe("getCredoSupportContact", () => {
  it("returns direct phone, WhatsApp, and support email links for consent help", () => {
    const contact = getCredoSupportContact("consent-link", ZENOWETHU);

    expect(contact.phoneDisplay).toBe("081 747 7616");
    expect(contact.phoneHref).toBe("tel:+27817477616");
    expect(contact.whatsappHref).toBe(
      "https://wa.me/27817477616?text=Hi%20Zenowethu%2C%20I%20need%20help%20with%20my%20Credo%20consent%20link.",
    );
    expect(contact.supportHref).toBe("mailto:support@zenowethu.co.za?subject=Credo%20consent%20link%20support");
  });

  it("uses a new-link request message for expired consent links", () => {
    const contact = getCredoSupportContact("expired-consent-link", ZENOWETHU);

    expect(contact.whatsappHref).toContain("Please%20send%20me%20a%20new%20link.");
    expect(contact.supportHref).toContain("expired%20link");
  });

  it("builds the links for another firm from its own details", () => {
    const contact = getCredoSupportContact("consent-link", { shortName: "Mokgoshi", phone: "+27 12 000 0000", email: "help@mokgoshiempire.co.za" });
    expect(contact.phoneHref).toBe("tel:+27120000000");
    expect(contact.whatsappHref).toContain("wa.me/27120000000?text=Hi%20Mokgoshi");
    expect(contact.supportHref).toContain("mailto:help@mokgoshiempire.co.za");
  });
});

describe("toE164Digits", () => {
  it("normalises local, spaced and international forms", () => {
    expect(toE164Digits("081 747 7616")).toBe("27817477616");
    expect(toE164Digits("+27 81 747 7616")).toBe("27817477616");
    expect(toE164Digits("27817477616")).toBe("27817477616");
  });
});
