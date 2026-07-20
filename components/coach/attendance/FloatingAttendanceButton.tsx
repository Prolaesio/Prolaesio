'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';

interface FloatingAttendanceButtonProps {
  x: number;
  y: number;
  onOpen: () => void;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPosition(anchor: { x: number; y: number }, width: number, height: number): { left: number; top: number } {
  if (typeof window === 'undefined') {
    return { left: anchor.x, top: anchor.y };
  }

  const margin = 8;
  const gap = 28;
  const left = anchor.x - width / 2;
  let top = anchor.y - height - gap;

  if (top < margin) {
    top = anchor.y + gap;
  }

  return {
    left: clamp(left, margin, Math.max(margin, window.innerWidth - width - margin)),
    top: clamp(top, margin, Math.max(margin, window.innerHeight - height - margin)),
  };
}

export function FloatingAttendanceButton({ x, y, onOpen, onClose }: FloatingAttendanceButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState(() => getPosition({ x, y }, 150, 42));

  useLayoutEffect(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    setPosition(getPosition({ x, y }, rect?.width ?? 150, rect?.height ?? 42));
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="fixed z-[140] inline-flex items-center gap-2 rounded-full border border-[rgba(var(--accent-primary-rgb),0.45)] bg-[rgba(var(--surface-shell-rgb),0.98)] px-3.5 py-2 text-xs font-bold text-white shadow-[0_14px_30px_rgba(0,0,0,0.38)] backdrop-blur transition-transform active:scale-95"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label="Open attendance"
    >
      <ClipboardCheck size={15} className="text-[var(--accent-primary)]" />
      Attendance
    </button>
  );
}
