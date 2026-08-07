/**
 * ShimmerButton — ReactBits animated button with shimmer sweep effect.
 */
import { type ReactNode, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  shimmerColor?: string
  background?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'h-8 px-4 text-xs',
  md: 'h-10 px-6 text-sm',
  lg: 'h-12 px-8 text-base',
}

export function ShimmerButton({
  children,
  shimmerColor = 'rgba(255,255,255,0.15)',
  background = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  className,
  size = 'md',
  disabled,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        'shimmer-btn relative inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white transition-all duration-200',
        'overflow-hidden',
        'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
        SIZE_CLASSES[size],
        className,
      )}
      style={{ background }}
    >
      {/* Shimmer sweep */}
      <span
        className="shimmer-sweep pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(105deg, transparent 20%, ${shimmerColor} 50%, transparent 80%)`,
          backgroundSize: '200% 100%',
          animation: 'shimmer-sweep 2.5s ease-in-out infinite',
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>

      <style>{`
        @keyframes shimmer-sweep {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </button>
  )
}
