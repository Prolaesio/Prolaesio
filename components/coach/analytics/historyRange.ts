export type AnalyticsHistoryRange = '7' | '14' | '30' | 'unlimited';

export const historyRangeOptions: Array<{ value: AnalyticsHistoryRange; label: string }> = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'unlimited', label: 'Unlimited' },
];

const oneDayMs = 24 * 60 * 60 * 1000;

export function getAnalyticsDateTime(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function filterAnalyticsPoints<T extends { date: string }>(points: T[], minDateTime: number | null) {
  if (minDateTime == null) return points;
  return points.filter((point) => {
    const pointTime = getAnalyticsDateTime(point.date);
    return pointTime != null && pointTime >= minDateTime;
  });
}

export function getHistoryMinDateTime(
  pointGroups: Array<Array<{ date: string }>>,
  historyRange: AnalyticsHistoryRange
) {
  if (historyRange === 'unlimited') return null;

  const historyDays = Number(historyRange);
  if (!Number.isFinite(historyDays)) return null;

  const allDateTimes = pointGroups.flatMap((points) =>
    points.flatMap((point) => {
      const time = getAnalyticsDateTime(point.date);
      return time == null ? [] : [time];
    })
  );
  const latestDateTime = allDateTimes.length === 0 ? null : Math.max(...allDateTimes);
  if (latestDateTime == null) return null;

  return latestDateTime - (historyDays - 1) * oneDayMs;
}
