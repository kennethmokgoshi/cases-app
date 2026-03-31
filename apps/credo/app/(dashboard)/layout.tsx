"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/* ─── Icons ──────────────────────────────────────────────────────── */
const DashboardIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="2" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <rect x="9.5" y="2" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <rect x="2" y="9.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <rect x="9.5" y="9.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
  </svg>
);

const CreditIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M3 5.5l3.5-2.5 3 2 3-1.5 2.5 2" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 9.5l3.5-2 3 1.5 3.5-2 2 1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 16h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M2 2v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const CasesIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <path d="M6 3V1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M12 3V1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M2 7.5h14" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6 13.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const QuoteIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2L2.5 5.5v4c0 3.5 2.8 6.6 6.5 7.5 3.7-.9 6.5-4 6.5-7.5v-4L9 2z" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinejoin="round" />
    <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DocumentsIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M10.5 2H4a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6.5L10.5 2z" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinejoin="round" />
    <path d="M10.5 2v4.5H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6 10h6M6 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M3.93 3.93l1.06 1.06M13.01 13.01l1.06 1.06M3.93 14.07l1.06-1.06M13.01 4.99l1.06-1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2a5 5 0 00-5 5v3l-1.5 2H15.5L14 10V7a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7.5 14.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/* ─── Nav items ──────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/dashboard",       label: "Dashboard",     Icon: DashboardIcon },
  { href: "/credit-report",   label: "Credit Report", Icon: CreditIcon    },
  { href: "/cases",           label: "My Cases",      Icon: CasesIcon     },
  { href: "/quote",           label: "Get a Quote",   Icon: QuoteIcon     },
  { href: "/documents",       label: "Documents",     Icon: DocumentsIcon },
];

const BOTTOM_NAV = [
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

/* ─── Sidebar ────────────────────────────────────────────────────── */
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside style={{
      width: collapsed ? 64 : 240,
      minHeight: "100vh",
      background: "#FFFFFF",
      borderRight: "1px solid #E2E8F0",
      display: "flex",
      flexDirection: "column",
      transition: "width 250ms cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
      flexShrink: 0,
      position: "sticky",
      top: 0,
    }}>
      {/* Logo */}
      <div style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: collapsed ? "0 16px" : "0 20px",
        borderBottom: "1px solid #E2E8F0",
        justifyContent: collapsed ? "center" : "space-between",
        gap: 10,
      }}>
        {!collapsed && (
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", overflow: "hidden" }}>
            <div style={{
              width: 32, height: 32, flexShrink: 0,
              background: "#0B1D35",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2C5.69 2 3 4.69 3 9s2.69 7 6 7 7-3.13 7-7" stroke="#C4953A" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M13 2l2.5 2.5L13 7" stroke="#C4953A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 9l2 2 3.5-3.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "#0B1D35", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
              Credo
            </span>
          </Link>
        )}
        {collapsed && (
          <div style={{
            width: 32, height: 32,
            background: "#0B1D35",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2C5.69 2 3 4.69 3 9s2.69 7 6 7 7-3.13 7-7" stroke="#C4953A" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M13 2l2.5 2.5L13 7" stroke="#C4953A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 9l2 2 3.5-3.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4, borderRadius: 6 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {collapsed && (
          <div style={{ position: "absolute", top: 20, right: -1 }}>
            <button onClick={onToggle} style={{
              background: "#FFFFFF", border: "1px solid #E2E8F0",
              borderRadius: "0 6px 6px 0",
              cursor: "pointer", color: "#94A3B8",
              padding: "4px 3px",
              display: "flex", alignItems: "center",
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}
              title={collapsed ? label : undefined}
              style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "9px" : "9px 12px" }}
            >
              <Icon active={active} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid #E2E8F0" }}>
        {BOTTOM_NAV.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}
              title={collapsed ? label : undefined}
              style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "9px" : "9px 12px" }}
            >
              <Icon active={active} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* User avatar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "9px" : "10px 12px",
          marginTop: 4,
          borderRadius: 8,
          cursor: "pointer",
          justifyContent: collapsed ? "center" : "flex-start",
        }}>
          <div style={{
            width: 30, height: 30, flexShrink: 0,
            background: "linear-gradient(135deg, #0B1D35, #1E4470)",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "#C4953A",
            letterSpacing: "0.02em",
          }}>
            SS
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", margin: 0, whiteSpace: "nowrap" }}>
                Sipho Sithole
              </p>
              <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0, whiteSpace: "nowrap" }}>
                Standard plan
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ─── Top Bar ────────────────────────────────────────────────────── */
function TopBar({ onMobileMenuToggle }: { onMobileMenuToggle: () => void }) {
  const pathname = usePathname();

  const pageTitle: Record<string, string> = {
    "/dashboard":     "Dashboard",
    "/credit-report": "Credit Report",
    "/cases":         "My Cases",
    "/quote":         "Get a Quote",
    "/documents":     "Document Vault",
    "/settings":      "Settings",
  };

  const title = pageTitle[pathname] ?? "Credo";

  return (
    <header style={{
      height: 64,
      background: "#FFFFFF",
      borderBottom: "1px solid #E2E8F0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onMobileMenuToggle}
          style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 4 }}
          className="md:hidden"
        >
          <MenuIcon />
        </button>
        <h1 style={{ fontSize: "1rem", fontWeight: 700, color: "#0F172A", margin: 0 }}>
          {title}
        </h1>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px",
          background: "#F8F9FA",
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          color: "#94A3B8",
          cursor: "text",
          width: 220,
        }}>
          <SearchIcon />
          <span style={{ fontSize: "0.875rem" }}>Search...</span>
        </div>

        {/* Notifications */}
        <button style={{
          position: "relative",
          background: "none", border: "none",
          cursor: "pointer",
          color: "#64748B",
          padding: 8,
          borderRadius: 8,
          display: "flex", alignItems: "center",
        }}>
          <BellIcon />
          <span style={{
            position: "absolute", top: 6, right: 6,
            width: 7, height: 7,
            background: "#DC2626",
            borderRadius: "50%",
            border: "1.5px solid white",
          }} />
        </button>

        {/* Avatar */}
        <button style={{
          width: 34, height: 34,
          background: "linear-gradient(135deg, #0B1D35, #1E4470)",
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.6875rem",
          fontWeight: 700,
          color: "#C4953A",
          letterSpacing: "0.02em",
        }}>
          SS
        </button>
      </div>
    </header>
  );
}

/* ─── Layout ─────────────────────────────────────────────────────── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8F9FA" }}>
      {/* Desktop sidebar */}
      <div style={{ display: "flex" }} className="hidden lg:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 200, display: "flex",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 260 }}>
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar onMobileMenuToggle={() => setMobileOpen(true)} />
        <main style={{ flex: 1, padding: "28px 28px", maxWidth: 1200 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
