import { formatTokens, formatFullNumber } from "@/lib/utils"

export function TokenDisplay({ n, className }: { n: number; className?: string }) {
  return (
    <span title={formatFullNumber(n)} className={className}>
      {formatTokens(n)}
    </span>
  )
}
