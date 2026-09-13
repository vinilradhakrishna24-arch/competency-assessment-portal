'use client';

import * as React from 'react';
import { X } from 'lucide-react';

/** Full-screen, dependency-free image viewer built on the native <dialog>
 * element (same approach as src/components/ui/dialog.tsx) so tapping/
 * clicking a question image enlarges it for closer inspection on any
 * device. Closes on the backdrop, the close button, or Escape. */
export function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt = 'Enlarged question image',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | null;
  alt?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!src) return null;

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onCancel={() => onOpenChange(false)}
      onClick={(e) => {
        if (e.target === ref.current) onOpenChange(false);
      }}
      className="h-full max-h-none w-full max-w-none border-0 bg-slate-950/90 p-0 backdrop:bg-slate-950/90"
      aria-label={alt}
    >
      <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-8">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
    </dialog>
  );
}
