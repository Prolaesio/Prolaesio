import React from 'react';

interface ReadinessGaugeProps {
  score: number;
  color: string;
  label: string;
}

export function ReadinessGauge({ score, color, label }: ReadinessGaugeProps) {
  const radius = 48;
  const stroke = 7;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center animate-fade-in touch-target">
      <div
        className="absolute inset-1 rounded-full opacity-25 blur-lg"
        style={{ background: color }}
        aria-hidden="true"
      />
      <div className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(18,35,24,0.76)_0%,rgba(10,10,9,0.68)_62%,rgba(10,10,9,0.4)_100%)]">
        <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
          <circle
            stroke="rgba(255,255,255,0.12)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{
              strokeDashoffset,
              transition: 'stroke-dashoffset 1s ease-out',
              filter: `drop-shadow(0 0 4px ${color})`,
            }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-[28px] font-black leading-none tracking-normal" style={{ color }}>
            {score}
          </span>
          <span className="mt-0.5 text-[10px] font-bold text-white/80 capitalize">{label}</span>
        </div>
      </div>
    </div>
  );
}
