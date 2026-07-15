import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 32 }}>
            <img src="/logo.png" alt="Crediva" style={{ height: 32, width: "auto" }} />
          </Link>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#0F172A", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>Privacy Policy</h1>
          <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: 0 }}>Last updated: March 2026 · POPIA compliant</p>
        </div>

        <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "40px 48px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          {[
            {
              title: "1. Who We Are",
              body: "Credo is a South African consumer credit repair platform. We are the responsible party for your personal information as defined under the Protection of Personal Information Act No. 4 of 2013 (POPIA). Our Information Officer can be contacted at privacy@credo.co.za.",
            },
            {
              title: "2. Information We Collect",
              body: "We collect: (a) identity information — your full name, SA ID number, email address, phone number, and province; (b) credit information — credit reports retrieved from SA bureaus on your behalf; (c) usage data — how you interact with the platform, for service improvement purposes. We do not collect biometric data.",
            },
            {
              title: "3. Why We Process Your Information",
              body: "Your information is processed to: deliver credit report retrieval and dispute services; personalise your credit repair action plan; send you notifications about your case progress; comply with our legal obligations under the NCA, POPIA, and other applicable South African law. We do not sell your personal information to any third party.",
            },
            {
              title: "4. Credit Bureau Data",
              body: "Your SA ID number is used exclusively to retrieve your credit reports from TransUnion SA, Experian SA, XDS, and Lightstone, as permitted under NCA Section 72. This retrieval is done with your explicit consent, recorded at registration. Bureau report data is encrypted and stored only for the duration necessary to provide your service.",
            },
            {
              title: "5. Data Sharing",
              body: "We share your information only with: (a) registered South African credit bureaus — to retrieve your reports; (b) our debt counsellor partners — only where you have requested debt review services; (c) payment processors — to process subscription fees; (d) law enforcement — where legally required. All third parties are bound by data processing agreements.",
            },
            {
              title: "6. Your POPIA Rights",
              body: "Under POPIA you have the right to: access your personal information held by us; correct inaccurate information; object to processing; request deletion of your information (subject to legal retention requirements); lodge a complaint with the Information Regulator of South Africa at complaints.IR@justice.gov.za.",
            },
            {
              title: "7. Data Security",
              body: "We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, and role-based access controls. We conduct regular security assessments. In the event of a data breach that poses a risk to your rights, we will notify you and the Information Regulator within 72 hours as required by POPIA.",
            },
            {
              title: "8. Retention",
              body: "We retain your account data for as long as your account is active. After account closure, we retain records for 5 years as required by the NCA. Credit bureau report data is deleted after 12 months from retrieval unless you request earlier deletion.",
            },
            {
              title: "9. Cookies",
              body: "We use only essential cookies required for authentication and session management. We do not use advertising or tracking cookies. You can disable cookies in your browser, but this may affect your ability to log in.",
            },
          ].map(section => (
            <div key={section.title} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>{section.title}</h2>
              <p style={{ fontSize: "0.9375rem", color: "#374151", lineHeight: 1.7, margin: 0 }}>{section.body}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", marginTop: 32, fontSize: "0.875rem", color: "#64748B" }}>
          Questions?{" "}
          <a href="mailto:privacy@credo.co.za" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>privacy@credo.co.za</a>
          {" · "}
          <Link href="/terms" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
