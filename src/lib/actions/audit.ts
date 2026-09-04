'use server';

import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActorType } from '@/types/database';

export interface AuditLogFilters {
  action?: string;
  actorType?: ActorType | '';
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface AuditLogRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_type: ActorType;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value_json: unknown;
  new_value_json: unknown;
  ip_address: string | null;
  user_agent: string | null;
  profiles: { full_name: string; email: string } | null;
}

export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogRow[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('audit_logs')
    .select('*, profiles(full_name, email)')
    .order('created_at', { ascending: false });

  if (filters.action) query = query.eq('action', filters.action);
  if (filters.actorType) query = query.eq('actor_type', filters.actorType);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  if (filters.search) query = query.ilike('entity_id', `%${filters.search}%`);

  const { data, error } = await query.limit(1000);
  if (error) throw new Error(error.message);
  return data as unknown as AuditLogRow[];
}

export async function getDistinctAuditActions(): Promise<string[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('audit_logs').select('action').limit(5000);
  return Array.from(new Set((data ?? []).map((r) => r.action))).sort();
}
