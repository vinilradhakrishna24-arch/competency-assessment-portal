'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Menu, X, ShieldCheck } from 'lucide-react';
import { STREAM_NAV_ITEMS, SHARED_NAV_ITEMS, type NavItem } from '@/components/layout/nav-items';
import type { CompetencyStream, RoleName } from '@/types/database';
import { cn } from '@/lib/utils';

export function Sidebar({
  role,
  streamScope,
  portalName,
  logoUrl,
}: {
  role: RoleName;
  /** Null = unrestricted (sees both streams). See CurrentUser.streamScope. */
  streamScope: CompetencyStream[] | null;
  portalName: string;
  logoUrl: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStream = searchParams.get('stream');
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const canSeeStream = (stream: CompetencyStream) => !streamScope || streamScope.includes(stream);
  const forStream = (stream: CompetencyStream): NavItem[] =>
    STREAM_NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
      ...item,
      stream,
      href: `${item.href}?stream=${stream}`,
    }));

  const technicalItems = canSeeStream('technical') ? forStream('technical') : [];
  const hseItems = canSeeStream('hse') ? forStream('hse') : [];
  const sharedItems = SHARED_NAV_ITEMS.filter((item) => item.roles.includes(role));

  // A stream-scoped role only ever has one section to show, so the
  // "Technical" / "HSE" headers only earn their keep when there are two.
  const showSectionLabels = technicalItems.length > 0 && hseItems.length > 0;

  function isActive(item: NavItem): boolean {
    const [base] = item.href.split('?');
    if (pathname !== base && !pathname.startsWith(base + '/')) return false;
    if (!item.stream) return true;
    // No ?stream= in the URL yet (e.g. a bookmarked bare /dashboard link)
    // defaults to Technical, matching every page's own server-side default.
    return currentStream ? currentStream === item.stream : item.stream === 'technical';
  }

  function renderLink(item: NavItem) {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          active ? 'bg-brand-navy-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
      >
        <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  function renderSection(label: string, items: NavItem[]) {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
        {showSectionLabels && (
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        )}
        {items.map(renderLink)}
      </div>
    );
  }

  const NavList = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {renderSection('Technical', technicalItems)}
      {renderSection('HSE', hseItems)}
      {sharedItems.length > 0 && (
        <div className={cn('flex flex-col gap-1', (technicalItems.length > 0 || hseItems.length > 0) && 'mt-2 border-t border-slate-100 pt-2')}>
          {sharedItems.map(renderLink)}
        </div>
      )}
    </nav>
  );

  const Brand = (
    <div className="flex items-center gap-2.5 px-4 py-5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-9 w-auto max-w-[152px] shrink-0 object-contain" />
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
