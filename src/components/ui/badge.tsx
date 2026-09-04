import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AssessmentStatus } from '@/types/database';
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from '@/lib/constants';

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        className
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: AssessmentStatus }) {
  return (
    <Badge className={STATUS_BADGE_CLASSES[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
