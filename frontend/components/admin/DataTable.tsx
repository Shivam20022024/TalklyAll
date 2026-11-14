import type { ReactNode } from 'react'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

export interface Column<Row> {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  /** Custom cell. Defaults to the raw value, with a dash when it is missing. */
  render?: (row: Row) => ReactNode
  className?: string
}

/**
 * Admin table built from the shared Table primitives. Display only: it renders the
 * rows it is given and never fetches or filters anything itself.
 */
export function DataTable<Row extends Record<string, any>>({
  columns,
  rows,
  minWidth = 640,
  message,
  rowKey,
  label,
}: {
  columns: Column<Row>[]
  rows: Row[]
  minWidth?: number
  /** Loading / empty / error content shown under the header. */
  message?: ReactNode
  rowKey?: (row: Row, index: number) => string
  /** Accessible name for the scrollable table region. */
  label?: string
}) {
  return (
    <Table minWidth={minWidth} message={message} label={label}>
      <THead>
        <TR className="hover:bg-transparent">
          {columns.map((c) => (
            <TH key={c.key} align={c.align}>
              {c.label}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, i) => (
          <TR key={rowKey ? rowKey(row, i) : i}>
            {columns.map((c) => (
              <TD key={c.key} align={c.align} className={c.className}>
                {c.render ? c.render(row) : row[c.key] === null || row[c.key] === undefined || row[c.key] === '' ? <span className="text-ds-ink-3">—</span> : String(row[c.key])}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
