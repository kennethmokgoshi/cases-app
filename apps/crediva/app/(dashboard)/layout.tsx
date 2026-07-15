"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  DashboardIcon,
  CreditIcon,
  CasesIcon,
  QuoteIcon,
  DocumentsIcon,
  SettingsIcon,
  MenuIcon,
  BellIcon,
  SearchIcon,
  AccountIcon,
} from "../../components/icons";

/* ─── Nav items ──────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/dashboard",       label: "Dashboard",     Icon: DashboardIcon },
  { href: "/my-account",      label: "My Account",    Icon: AccountIcon   },
  { href: "/credit-report",   label: "Credit Report", Icon: CreditIcon    },
  { href: "/cases",           label: "My Cases",      Icon: CasesIcon     },
  { href: "/quote",           label: "Get a Quote",   Icon: QuoteIcon     },
  { href: "/documents",       label: "Documents",     Icon: DocumentsIcon },
];

const ADMIN_NAV = [
  { href: "/admin/branding",  label: "White-Label",   Icon: SettingsIcon  },
  { href: "/admin/users",     label: "Manage Users",  Icon: CasesIcon     },
  { href: "/admin/analytics", label: "Tenant Stats",  Icon: DashboardIcon },
];

const BOTTOM_NAV = [
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

import { useSession, signOut } from "next-auth/react";

/* ─── Sidebar ────────────────────────────────────────────────────── */
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userName = session?.user?.name || "Consumer";
  const initials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  
  const isAdmin = (session?.user as any)?.isAdmin || (session?.user as any)?.role === "EXECUTIVE";

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
      {/* ... (Logo section unchanged) ... */}
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
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none", overflow: "hidden" }}>
            <img src="/logo.png" alt="Crediva" style={{ height: 36, width: "auto" }} />
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
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
          </Link>
        )}
        {!collapsed && (
          <button aria-label="Collapse sidebar" onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4, borderRadius: 6 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {collapsed && (
          <div style={{ position: "absolute", top: 20, right: -1 }}>
            <button aria-label="Expand sidebar" onClick={onToggle} style={{
              background: "#FFFFFF", border: "1px solid #E2E8F0",
              borderRadius: "0 6px 6px 0",
              cursor: "pointer", color: "#94A3B8",
              padding: "4px 3px",
              display: "flex", alignItems: "center",
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: collapsed ? "0 0 8px 0" : "4px 12px 10px", textAlign: collapsed ? "center" : "left" }}>
          {!collapsed ? "Menu" : "•"}
        </p>
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

        {isAdmin && (
          <>
            <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: collapsed ? "16px 0 8px 0" : "18px 12px 10px", textAlign: collapsed ? "center" : "left" }}>
              {!collapsed ? "Management" : "•"}
            </p>
            {ADMIN_NAV.map(({ href, label, Icon }) => {
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
          </>
        )}
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
            {initials}
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", margin: 0, whiteSpace: "nowrap" }}>
                {userName}
              </p>
              <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: 0, whiteSpace: "nowrap" }}>
                {session?.user?.email || "Consumer Portal"}
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
  const { data: session } = useSession();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userName = session?.user?.name || "Consumer";
  const initials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const pageTitle: Record<string, string> = {
    "/dashboard":     "Dashboard",
    "/my-account":    "My Account",
    "/credit-report": "Credit Report",
    "/cases":         "My Cases",
    "/quote":         "Get a Quote",
    "/documents":     "Document Vault",
    "/settings":      "Settings",
  };

  const title = pageTitle[pathname] ?? "Crediva";

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
          aria-label="Open mobile menu"
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
        <div style={{ position: "relative" }}>
          <button 
            aria-label="Toggle notifications"
            aria-expanded={showNotifications}
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              background: showNotifications ? "#F1F5F9" : "none", 
              border: "none",
              cursor: "pointer",
              color: showNotifications ? "#0F172A" : "#64748B",
              padding: 8,
              borderRadius: 8,
              display: "flex", alignItems: "center",
              transition: "all 150ms",
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

          {showNotifications && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 280,
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              padding: "12px",
              zIndex: 100,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0F172A" }}>Notifications</span>
                <button style={{ fontSize: "0.75rem", color: "#C4953A", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
                  Mark all as read
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "8px", background: "#F8F9FA", borderRadius: 8, border: "1px solid #F1F5F9" }}>
                  <p style={{ fontSize: "0.8125rem", color: "#0F172A", fontWeight: 600, margin: "0 0 2px" }}>Dashboard Activated</p>
                  <p style={{ fontSize: "0.75rem", color: "#64748B", margin: 0 }}>Welcome to your new white-labeled portal.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Role Badge */}
        {(session?.user as any)?.role !== "CONSUMER" && (
          <span style={{
            padding: "4px 10px",
            background: (session?.user as any)?.role === "EXECUTIVE" ? "#FFFBEB" : "#F1F5F9",
            color: (session?.user as any)?.role === "EXECUTIVE" ? "#B45309" : "#475569",
            borderRadius: 6,
            fontSize: "0.6875rem",
            fontWeight: 700,
            letterSpacing: "0.02em",
            textTransform: "uppercase"
          }}>
            {(session?.user as any)?.role}
          </span>
        )}

        {/* Avatar */}
        <div style={{ position: "relative" }}>
          <button 
            aria-label="Toggle user menu"
            aria-expanded={showUserMenu}
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              width: 34, height: 34,
              background: "linear-gradient(135deg, #0B1D35, #1E4470)",
              borderRadius: "50%",
              border: showUserMenu ? "2px solid #C4953A" : "none",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "#C4953A",
              letterSpacing: "0.02em",
              transition: "all 150ms",
            }}>
            {initials}
          </button>

          {showUserMenu && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 220,
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              padding: "8px",
              zIndex: 100,
            }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #F1F5F9", marginBottom: 4 }}>
                <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#0F172A", margin: 0 }}>{userName}</p>
                <p style={{ fontSize: "0.75rem", color: "#64748B", margin: 0 }}>Free Plan</p>
              </div>
              
              <Link 
                href="/settings"
                onClick={() => setShowUserMenu(false)}
                style={{ display: "block", textDecoration: "none", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderRadius: 6, fontSize: "0.8125rem", color: "#475569", cursor: "pointer" }}
                className="hover:bg-slate-50"
              >
                Profile Settings
              </Link>
              
              <button 
                onClick={async () => {
                  await signOut({ callbackUrl: "/login" });
                }}
                style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderRadius: 6, fontSize: "0.8125rem", color: "#DC2626", fontWeight: 600, cursor: "pointer" }}
                className="hover:bg-red-50"
              >
                Log out
              </button>
            </div>
          )}
        </div>
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
