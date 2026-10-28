// frontend/src/components/layout/Sidebar.tsx
// Left navigation sidebar.

import { useState } from "react";

interface SidebarProps {
  active: string;
  onSelect: (key: string) => void;
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { key: "rack-map", label: "Rack Map", icon: "M3 12l2-2m0 0l7-7 7 7M5 13v10a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6z" },
    { key: "queue", label: "Priority Queue", icon: "M3 9h18M3 9v9a4 4 0 004 4h12a4 4 0 004-4V9z" },
    { key: "forecast", label: "Forecasting", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { key: "hitl", label: "HITL Console", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-20 w-64 border-r border-brand-surface bg-brand-dark transform transition-transform duration-300 ${
        collapsed ? "-translate-x-full" : ""
      }`}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-brand-surface">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-white"
          aria-label="Toggle sidebar"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-semibold text-brand-accent hidden md:block">AO-02</span>
      </div>
      <nav className="mt-6 px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active === item.key
                ? "bg-brand-accent/10 text-brand-accent"
                : "text-gray-400 hover:text-white hover:bg-brand-surface/30"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              dangerouslySetInnerHTML={{ __html: item.icon }}
            />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto p-4 border-t border-brand-surface">
        <div className="text-xs text-gray-500">Branch: dev/ao02-core</div>
        <div className="text-xs text-gray-500 truncate">Step 4 — Frontend</div>
      </div>
    </aside>
  );
}
