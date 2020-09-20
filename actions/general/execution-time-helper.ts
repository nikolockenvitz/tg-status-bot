export function interval(lastExecutionTime: Date, intervalInSeconds: number): Date {
  return new Date(Math.max(lastExecutionTime.getTime() + intervalInSeconds * 1000, Date.now()));
}

export enum DAY {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export function weekly(lastExecutionTime: Date, day: number, hours: number, minutes: number): Date {
  /**
   * find previous and next matching weekday
   * if last execution is in between -> next matching weekday
   * else -> too long time not executed -> now
   */
  function getTodayWithDesiredHoursAndMinutes() {
    const today = new Date();
    today.setHours(hours);
    today.setMinutes(minutes);
    today.setSeconds(0);
    today.setMilliseconds(0);
    return today;
  }
  const now = new Date();
  const nextMatch = getTodayWithDesiredHoursAndMinutes();
  nextMatch.setDate(now.getDate() + ((day - now.getDay()) % 7) + (now > getTodayWithDesiredHoursAndMinutes() ? 7 : 0));
  const previousMatch = new Date(nextMatch.getTime() - 7 * 24 * 60 * 60 * 1000);
  return lastExecutionTime > previousMatch ? nextMatch : now;
}
