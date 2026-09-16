import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  Users,
  BookOpenCheck,
  Award,
  BarChart3,
  UserCog,
  History,
  Settings,
  ClipboardCheck,
} from 'lucide-react';
import type { CompetencyStream, RoleName } from '@/types/database';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: RoleName[];
  /** Set only on items that exist once per competency stream (Dashboard,
   * Assessments, Question Bank, Certificates, Reports) -- the Sidebar
   * renders one copy under "Technical" and one under "HSE", each linking
   * to the same page with a `?stream=` query param the page reads to
   * filter its competency picker and initial data. */
  stream?: CompetencyStream;
}

/** Rendered twice by the Sidebar -- once per stream, with `?stream=` appended.
 * Kept separate from SHARED_NAV_ITEMS so a stream-scoped role (e.g. HSE
 * Manager) can have the Technical copy hidden entirely rather than just
 * RLS-filtered down to an empty list. */
export const STREAM_NAV_ITEMS: Omit<NavItem, 'stream'>[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'viewer'] },
  { href: '/assessments', label: 'Assessments', icon: ClipboardList, roles: ['admin', 'viewer'] },
  { href: '/questions', label: 'Question Bank', icon: BookOpenCheck, roles: ['admin'] },
  { href: '/certificates', label: 'Certificates', icon: Award, roles: ['admin', 'viewer'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'viewer'] },
];

/** Everything else: not competency-stream-specific, so it appears once
 * regardless of which stream(s) the signed-in role can see. */
export const SHARED_NAV_ITEMS: NavItem[] = [
  { href: '/create-assessment', label: 'Create Assessment', icon: FilePlus2, roles: ['admin'] },
  { href: '/candidates', label: 'Candidates', icon: Users, roles: ['admin', 'viewer'] },
  { href: '/approvals', label: 'Pending Approval', icon: ClipboardCheck, roles: ['admin'] },
  { href: '/users', label: 'Users & Roles', icon: UserCog, roles: ['admin'] },
  { href: '/audit-log', label: 'Audit Log', icon: History, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];
