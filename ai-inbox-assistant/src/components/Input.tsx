import type { InputHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

type Props = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
        className,
      )}
      {...props}
    />
  )
}

