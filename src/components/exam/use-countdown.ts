'use client';

import * as React from 'react';
import { clampSeconds } from '@/lib/utils';

/**
 * Client-side display countdown only. The single source of truth for
 * "when does this exam actually end" is always the server's `ends_at`
 * timestamp (validated authoritatively on every save/submit call) — this
 * hook merely renders a ticking clock. `serverTime` at the moment `endsAt`
 * was fetched lets us compute a clock-skew offset so a candidate's wrong
 * local clock cannot make the displayed timer lie, though it still cannot
 * extend the real deadline either way since the server re-checks `ends_at`
 * on every request regardless of what the client displays.
 */
export function useCountdown(endsAt: string | null, serverTime: string | null, onExpire?: () => void) {
  const offsetRef = React.useRef(0);
  const [remainingSeconds, setRemainingSeconds] = React.useState<number | null>(null);
  const expiredFiredRef = React.useRef(false);

  React.useEffect(() => {
    if (serverTime) {
      offsetRef.current = new Date(serverTime).getTime() - Date.now();
    }
  }, [serverTime]);

  React.useEffect(() => {
    if (!endsAt) {
      setRemainingSeconds(null);
      return;
    }
    expiredFiredRef.current = false;

    const tick = () => {
      const now = Date.now() + offsetRef.current;
      const remainingMs = new Date(endsAt).getTime() - now;
      const seconds = clampSeconds(remainingMs);
      setRemainingSeconds(seconds);
      if (seconds <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpire?.();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  return remainingSeconds;
}
