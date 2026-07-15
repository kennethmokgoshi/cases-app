import { describe, expect, it } from "vitest";

import { getCredoSupportContact } from "./support-contact";

describe("getCredoSupportContact", () => {
  it("returns direct phone, WhatsApp, and support email links for consent help", () => {
    const contact = getCredoSupportContact();

    expect(contact.phoneDisplay).toBe("081 747 7616");
    expect(contact.phoneHref).toBe("tel:+27817477616");
    expect(contact.whatsappHref).toBe(
      "https://wa.me/27817477616?text=Hi%20Zenowethu%2C%20I%20need%20help%20with%20my%20Credo%20consent%20link.",
    );
    expect(contact.supportHref).toBe("mailto:support@zenowethu.co.za?subject=Credo%20consent%20link%20support");
  });

  it("uses a new-link request message for expired consent links", () => {
    const contact = getCredoSupportContact("expired-consent-link");

    expect(contact.whatsappHref).toContain("Please%20send%20me%20a%20new%20link.");
    expect(contact.supportHref).toContain("expired%20link");
  });
});
