import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-9 px-3 text-sm' : 'h-10 px-4 text-sm',
        variant === 'primary' &&
          'bg-indigo-500 text-white hover:bg-indigo-400 active:bg-indigo-600',
        variant === 'secondary' &&
          'bg-white/10 text-white hover:bg-white/15 active:bg-white/20',
        variant === 'ghost' && 'bg-transparent text-slate-200 hover:bg-white/10',
        variant === 'danger' && 'bg-rose-500 text-white hover:bg-rose-400 active:bg-rose-600',
        className,
      )}
      {...props}
    />
  )
}

