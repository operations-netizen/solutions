/**
 * Formatting helpers. One place for date/number presentation so every screen
 * renders "20 Aug 2026" the same way.
 */

import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

/** `20 Aug 2026` */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'dd MMM yyyy') : fallback
}

/** `20 Aug 2026, 10:30 AM` */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'dd MMM yyyy, h:mm a') : fallback
}

/** `10:30 AM` */
export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'h:mm a') : fallback
}

/** `2 hours ago`, `3 days ago` */
export function formatRelative(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? `${formatDistanceToNowStrict(date)} ago` : fallback
}

/** `2h ago`, `3d ago` — the same fact, for table columns that cannot spare the width. */
export function formatRelativeShort(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  if (!date) return fallback
  const spelled = formatDistanceToNowStrict(date)
  const short = spelled
    .replace(/ seconds?$/, 's')
    .replace(/ minutes?$/, 'm')
    .replace(/ hours?$/, 'h')
    .replace(/ days?$/, 'd')
    .replace(/ months?$/, 'mo')
    .replace(/ years?$/, 'y')
  return `${short} ago`
}

/** Calendar-day delta from today. Negative means the date has passed. */
export function daysFromToday(value: string | Date | null | undefined): number | null {
  const date = toDate(value)
  return date ? differenceInCalendarDays(date, new Date()) : null
}

/** `Due in 3 days`, `Due today`, `Overdue by 2 days` */
export function formatDueLabel(dueDate: string | null | undefined): string {
  const days = daysFromToday(dueDate)
  if (days === null) return 'No due date'
  if (days < 0) return `Overdue by ${Math.abs(days)} ${plural(Math.abs(days), 'day')}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export function plural(count: number, word: string, suffix = 's'): string {
  return count === 1 ? word : `${word}${suffix}`
}

/** `1.4 MB` */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

/** `Rahul Verma` → `RV`. Used for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Date input (`<input type="date">`) value for a given ISO string. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'yyyy-MM-dd') : ''
}

/** Truncate on a word boundary for card previews. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`
}
