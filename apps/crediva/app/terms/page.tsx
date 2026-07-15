import Link from "next/link";

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 32 }}>
            <img src="/logo.png" alt="Crediva" style={{ height: 32, width: "auto" }} />
          </Link>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#0F172A", margin: "0 0 8px", fontFamily: "var(--font-playfair), Georgia, serif" }}>Terms of Service</h1>
          <p style={{ fontSize: "0.9375rem", color: "#64748B", margin: 0 }}>Last updated: March 2026</p>
        </div>

        <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "40px 48px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          {[
            {
              title: "1. Acceptance of Terms",
              body: "By registering for and using Credo, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform. Credo is a South African credit repair assistance platform governed by the National Credit Act No. 34 of 2005 (NCA) and the Protection of Personal Information Act No. 4 of 2013 (POPIA).",
            },
            {
              title: "2. Services",
              body: "Credo provides credit report retrieval, dispute facilitation, debt review assistance, and AI-powered credit coaching services. Our services are designed to help South African consumers understand and improve their credit profiles. We are not a registered debt counsellor and do not provide legal advice.",
            },
            {
              title: "3. Eligibility",
              body: "You must be a South African citizen or permanent resident with a valid South African ID number to use Credo. You must be 18 years or older. You agree to provide accurate, current, and complete information during registration.",
            },
            {
              title: "4. Data & Privacy",
              body: "Your personal information is processed in accordance with our Privacy Policy and POPIA. We collect your SA ID number solely to retrieve your credit reports from registered credit bureaus (TransUnion SA, Experian SA, XDS, and Lightstone) under NCA Section 72. Your data is encrypted at rest and in transit and is never sold to third parties.",
            },
            {
              title: "5. Credit Bureau Access",
              body: "By accepting these terms, you authorise Credo to retrieve your credit reports from all 4 South African credit bureaus on your behalf. This authorisation is valid for the duration of your account. You may revoke this authorisation at any time by closing your account.",
            },
            {
              title: "6. Fees & Billing",
              body: "Credo operates on a subscription model. Fees are clearly displayed before you commit to any paid tier. All prices are inclusive of VAT (15%) where applicable. You may cancel your subscription at any time; cancellation takes effect at the end of the current billing period.",
            },
            {
              title: "7. Limitation of Liability",
              body: "Credo provides tools and information to assist you with credit repair. We cannot guarantee specific credit score improvements. Our liability is limited to the fees paid by you in the 3 months preceding any claim. We are not liable for decisions made by credit bureaus, creditors, or debt counsellors.",
            },
            {
              title: "8. Governing Law",
              body: "These terms are governed by the laws of the Republic of South Africa. Any disputes shall be subject to the jurisdiction of the South African courts. Consumer protection rights under the Consumer Protection Act No. 68 of 2008 are preserved.",
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
          <a href="mailto:support@credo.co.za" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>Contact us</a>
          {" · "}
          <Link href="/privacy" style={{ color: "#0B1D35", fontWeight: 600, textDecoration: "none" }}>Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
