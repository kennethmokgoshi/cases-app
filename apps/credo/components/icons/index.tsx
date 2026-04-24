import React from "react";

export const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowRight = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L3 5.5v5c0 3.6 3 6.9 7 7.5 4-0.6 7-3.9 7-7.5v-5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 14l4-5 4 2 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M11 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V7l-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M7 12h6M7 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const BotIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="7.5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12.5" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

export const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="9" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 9V6.5a3.5 3.5 0 017 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="14" r="1.5" fill="currentColor" />
  </svg>
);

export const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 2c0 0-3 3.5-3 8s3 8 3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 2c0 0 3 3.5 3 8s-3 8-3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const DashboardIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="2" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <rect x="9.5" y="2" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <rect x="2" y="9.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <rect x="9.5" y="9.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
  </svg>
);

export const CreditIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M3 5.5l3.5-2.5 3 2 3-1.5 2.5 2" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 9.5l3.5-2 3 1.5 3.5-2 2 1.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 16h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M2 2v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const CasesIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <path d="M6 3V1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M12 3V1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M2 7.5h14" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6 13.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const QuoteIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2L2.5 5.5v4c0 3.5 2.8 6.6 6.5 7.5 3.7-.9 6.5-4 6.5-7.5v-4L9 2z" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinejoin="round" />
    <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DocumentsIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M10.5 2H4a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6.5L10.5 2z" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} strokeLinejoin="round" />
    <path d="M10.5 2v4.5H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6 10h6M6 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const SettingsIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M3.93 3.93l1.06 1.06M13.01 13.01l1.06 1.06M3.93 14.07l1.06-1.06M13.01 4.99l1.06-1.06" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2a5 5 0 00-5 5v3l-1.5 2H15.5L14 10V7a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7.5 14.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
