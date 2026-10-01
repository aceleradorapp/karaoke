import clsx from 'clsx';
import type { ReactNode } from 'react';

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
  children?: ReactNode;
}

const MAX_PERCENT = 100;

function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(0, Math.round(value)));
}

export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 5,
  label = 'Progresso',
  className,
  children,
}: ProgressRingProps) {
  const percent = clampPercent(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / MAX_PERCENT);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={MAX_PERCENT}
      aria-valuenow={percent}
      style={{ width: size, height: size }}
      className={clsx('relative inline-flex shrink-0 items-center justify-center', className)}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset]"
        />
      </svg>
      <span className="absolute text-xs font-semibold">{children ?? `${percent}%`}</span>
    </div>
  );
}
