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
} from 'lucide-react';
import type { RoleName } from '@/types/database';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: RoleName[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'viewer'] },
  { href: '/create-assessment', label: 'Create Assessment', icon: FilePlus2, roles: ['admin'] },
  { href: '/assessments', label: 'Assessments', icon: ClipboardList, roles: ['admin', 'viewer'] },
  { href: '/candidates', label: 'Candidates', icon: Users, roles: ['admin', 'viewer'] },
  { href: '/questions', label: 'Question Bank', icon: BookOpenCheck, roles: ['admin'] },
  { href: '/certificates', label: 'Certificates', icon: Award, roles: ['admin', 'viewer'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'viewer'] },
  { href: '/users', label: 'Users & Roles', icon: UserCog, roles: ['admin'] },
  { href: '/audit-log', label: 'Audit Log', icon: History, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];
