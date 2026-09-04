import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { ActorType } from '@/types/database';

export interface AuditLogInput {
  actorUserId?: string | null;
  actorType: ActorType;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Best-effort audit trail write. Never throws — a logging failure must
 * never block the underlying business operation, but we surface it to the
 * server console so it isn't silently lost. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from('audit_logs').insert({
      actor_user_id: input.actorUserId ?? null,
      actor_type: input.actorType,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      old_value_json: input.oldValue ?? null,
      new_value_json: input.newValue ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', input.action, err);
  }
}

/** Extract a best-effort client IP from a Next.js request, honoring common
 * reverse-proxy headers (Netlify/Vercel set x-forwarded-for). */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get('user-agent');
}
