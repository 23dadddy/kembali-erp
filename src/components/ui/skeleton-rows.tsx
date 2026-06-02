import { TableCell, TableRow } from '@/components/ui/table'

/** Drop-in replacement for a loading spinner in a <TableBody>. Renders content-shaped skeleton rows. */
export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} className="animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <div
                className="h-3.5 bg-slate-100 rounded-full"
                style={{ width: `${60 + ((i * 13 + j * 17) % 35)}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

/** Skeleton for a card/stat block */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border p-4 animate-pulse space-y-2">
      <div className="h-3 bg-slate-100 rounded-full w-1/3" />
      <div className="h-6 bg-slate-100 rounded-full w-1/2" />
    </div>
  )
}
