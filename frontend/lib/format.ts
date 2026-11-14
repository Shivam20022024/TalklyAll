/**
 * Display formatters for values the API already returns. Presentation only:
 * nothing here changes what is sent to or stored by the backend.
 */

/**
 * The backend stores timestamps with Python's datetime.utcnow() and serialises
 * them without a timezone suffix (e.g. "2026-11-12T10:05:00.123000"). JavaScript
 * parses such strings as LOCAL time, which shifted every displayed time by the
 * viewer's UTC offset (5h30m in India). Values that already carry "Z" or an
 * explicit offset are used as-is.
 */
export function parseApiDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  const isoNoZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
  const d = new Date(isoNoZone ? `${s}Z` : s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value: unknown): string {
  const d = parseApiDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatDate(value: unknown): string {
  const d = parseApiDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(value: unknown): string {
  const d = parseApiDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Seconds -> "mm:ss". Returns null for missing / non-positive values so callers can show a placeholder. */
export function formatDuration(seconds: unknown): string | null {
  const n = typeof seconds === 'number' ? seconds : parseInt(String(seconds ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatINR(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n)) return `₹${String(value)}`;
  return `₹${n.toLocaleString('en-IN')}`;
}
