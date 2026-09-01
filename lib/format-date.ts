/**
 * lib/format-date.ts
 * Date formatting pinned to the organization's timezone.
 *
 * Every timestamp in the app is rendered through here. Without a fixed zone,
 * Intl uses the runtime's zone — UTC on Vercel, local in the browser — so the
 * same shift rendered on the server and rehydrated on the client disagreed,
 * and server-rendered times were several hours off.
 */
const ORG_TIMEZONE = 'America/Chicago';

export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ORG_TIMEZONE,
    ...options,
  }).format(new Date(date));
}
