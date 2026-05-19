import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000_000_000_000_000) return (n / 1_000_000_000_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'Sx'
  if (n >= 1_000_000_000_000_000_000) return (n / 1_000_000_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'Qi'
  if (n >= 1_000_000_000_000_000) return (n / 1_000_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'Qa'
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'T'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

export function formatFullNumber(n: number): string {
  return n.toLocaleString('en-US')
}
