"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

export default function BrandingPage() {
  const { data: session } = useSession();
  const [primaryColor, setPrimaryColor] = useState("#0B1D35");
  const [accentColor, setAccentColor] = useState("#C4953A");
  const [tenantName, setTenantName] = useState("Zenowethu Debt Management");

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{
        background: "linear-gradient(135deg, #0B1D35, #112847)",
        borderRadius: 16, padding: "28px 32px",
        color: "white"
      }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px" }}>Tenant White-Labeling</h2>
        <p style={{ fontSize: "0.875rem", color: "#64748B", margin: 0 }}>
          Customize the look and feel of your Crediva consumer portal.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: 24 }}>
        <div className="credo-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 20 }}>Appearance Settings</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#475569" }}>Portal Name</label>
              <input 
                type="text" 
                value={tenantName} 
                onChange={(e) => setTenantName(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: "0.875rem" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#475569" }}>Primary Color</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input 
                    type="color" 
                    value={primaryColor} 
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    style={{ width: 40, height: 40, padding: 0, border: "none", borderRadius: 4, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.875rem", fontFamily: "monospace" }}>{primaryColor}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#475569" }}>Accent Color</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input 
                    type="color" 
                    value={accentColor} 
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: 40, height: 40, padding: 0, border: "none", borderRadius: 4, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.875rem", fontFamily: "monospace" }}>{accentColor}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#475569" }}>Organization Logo</label>
              <div style={{ 
                border: "2px dashed #E2E8F0", 
                borderRadius: 12, 
                padding: "30px", 
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10
              }}>
                <div style={{ width: 48, height: 48, flexShrink: 0, background: primaryColor, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 4v16m-8-8h16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>Click to upload or drag and drop logo</p>
                <p style={{ fontSize: "0.6875rem", color: "#94A3B8", margin: 0 }}>PNG, SVG or JPG (max 2MB)</p>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
               <button className="btn-primary" style={{ padding: "12px 24px" }}>Save Branding Changes</button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="credo-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: 16 }}>Live Preview</h3>
            <div style={{ 
              border: "1px solid #E2E8F0", 
              borderRadius: 10, 
              overflow: "hidden",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
            }}>
              <div style={{ height: 40, background: "#FFFFFF", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", padding: "0 12px", gap: 8 }}>
                <div style={{ width: 20, height: 20, background: primaryColor, borderRadius: 4 }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0B1D35" }}>{tenantName.split(" ")[0]}</span>
              </div>
              <div style={{ padding: 16, background: "#F8F9FA" }}>
                <div style={{ height: 12, width: "60%", background: "#E2E8F0", borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 32, width: "100%", background: primaryColor, borderRadius: 6, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ height: 40, width: "100%", background: "#FFFFFF", border: `2px solid ${primaryColor}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.625rem", fontWeight: 700, color: primaryColor }}>Button</span>
                  </div>
                  <div style={{ height: 40, width: "100%", background: accentColor, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "white" }}>Accent</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
