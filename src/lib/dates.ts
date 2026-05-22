const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatKoreanDate(dateKey: string) {
  const date = fromDateKey(dateKey);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayLabels[date.getDay()]}요일`;
}

export function getWeekdayLabel(day: number) {
  return weekdayLabels[day] ?? "";
}

export function getMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

export function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function buildMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: day,
      key: toDateKey(day),
      isCurrentMonth: day.getMonth() === month,
    };
  });
}

export function isFutureOrToday(dateKey: string) {
  return dateKey >= toDateKey(new Date());
}

export const allWeekdays = [0, 1, 2, 3, 4, 5, 6];
