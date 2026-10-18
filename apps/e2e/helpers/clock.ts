/** Today's calendar date in Asia/Karachi, plus `days`, as YYYY-MM-DD. */
export function karachiDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO instant for 11:00 Asia/Karachi (06:00Z) on the Karachi date `days` from today. */
export function karachiMorningIso(days: number): string {
  return `${karachiDatePlus(days)}T06:00:00.000Z`;
}
