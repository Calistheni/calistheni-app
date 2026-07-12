export function getAnalyticsPeriods(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const last7Days = new Date(now);
  last7Days.setDate(last7Days.getDate() - 7);

  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);

  return {
    today,
    last7Days,
    last30Days,
  };
}
