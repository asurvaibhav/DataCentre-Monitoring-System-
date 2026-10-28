// frontend/src/components/layout/Header.tsx
// Top header bar.

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between px-4 border-b border-brand-surface bg-brand-dark/95 backdrop-blur">
      <button onClick={onMenuClick} className="text-gray-400 hover:text-white" aria-label="Menu">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-brand-surface/50 border border-brand-surface/50">
          <span className="w-2 h-2 rounded-full bg-brand-ok" />
          <span className="text-xs font-medium text-gray-300">System Operational</span>
        </div>
        <div className="hidden md:flex items-center gap-1 px-3 py-1 rounded-full bg-brand-surface/50 border border-brand-surface/50">
          <span className="w-2 h-2 rounded-full bg-brand-warn animate-pulse" />
          <span className="text-xs font-medium text-gray-300">3 Active Tokens</span>
        </div>
      </div>
    </header>
  );
}
