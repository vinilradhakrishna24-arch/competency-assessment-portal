'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ShieldCheck } from 'lucide-react';
import { NAV_ITEMS } from '@/components/layout/nav-items';
import type { RoleName } from '@/types/database';
import { cn } from '@/lib/utils';

export function Sidebar({
  role,
  portalName,
  logoUrl,
}: {
  role: RoleName;
  portalName: string;
  logoUrl: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const NavList = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-navy-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const Brand = (
    <div className="flex items-center gap-2.5 px-4 py-5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy-900 text-white">
          <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
      )}
      <span className="truncate text-sm font-semibold text-slate-900">{portalName}</span>
    </div>
  );

  return (
    <>
      {/* Mobile top bar trigger */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        {Brand}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between">
              {Brand}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="mr-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {NavList}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {Brand}
        {NavList}
      </aside>
    </>
  );
}
