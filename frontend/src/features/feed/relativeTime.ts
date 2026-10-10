const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const relative = new Intl.RelativeTimeFormat("ko");
const absolute = new Intl.DateTimeFormat("ko", { dateStyle: "medium" });

/** "3분 전"-style distance from now, falling back to the date after a week. */
export function relativeTime(date: Date, now = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (seconds < MINUTE) return "방금 전";
  if (seconds < HOUR)
    return relative.format(-Math.floor(seconds / MINUTE), "minute");
  if (seconds < DAY)
    return relative.format(-Math.floor(seconds / HOUR), "hour");
  if (seconds < WEEK) return relative.format(-Math.floor(seconds / DAY), "day");
  return absolute.format(date);
}
