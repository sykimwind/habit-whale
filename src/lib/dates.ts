const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toDateKey(date: Date) {
  const parts = Object.fromEntries(kstDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatKoreanDate(dateKey: string) {
  const { month, day } = getDateKeyParts(dateKey);
  return `${month}월 ${day}일 ${weekdayLabels[getWeekdayFromDateKey(dateKey)]}요일`;
}

export function getWeekdayLabel(day: number) {
  return weekdayLabels[day] ?? "";
}

export function getMonthTitle(date: Date) {
  const { year, month } = getDateKeyParts(toDateKey(date));
  return `${year}년 ${month}월`;
}

export function addMonths(date: Date, amount: number) {
  const { year, month, day } = getDateKeyParts(toDateKey(date));
  return fromDateKey(toSafeDateKey(year, month + amount, day));
}

export function buildMonthDays(monthDate: Date) {
  const { year, month } = getDateKeyParts(toDateKey(monthDate));
  const firstKey = toSafeDateKey(year, month, 1);
  const start = Date.UTC(year, month - 1, 1 + -getWeekdayFromDateKey(firstKey), 12);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start + index * 24 * 60 * 60 * 1000);
    const key = toDateKey(day);
    const parts = getDateKeyParts(key);
    return {
      date: day,
      key,
      dayNumber: parts.day,
      isCurrentMonth: parts.month === month,
    };
  });
}

export function isFutureOrToday(dateKey: string) {
  return dateKey >= toDateKey(new Date());
}

export const allWeekdays = [0, 1, 2, 3, 4, 5, 6];

export function getWeekdayFromDateKey(dateKey: string) {
  const { year, month, day } = getDateKeyParts(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getDateKeyParts(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function toSafeDateKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, maxDay));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
