export const habitQuotes = [
  "매일 1퍼센트씩 나아지면 1년 뒤에는 전혀 다른 사람이 된다.",
  "목표는 방향을 정하고, 시스템은 앞으로 나아가게 한다.",
  "습관은 정체성에 대한 투표다.",
  "작게 시작하면 지속하기 쉬워진다.",
  "분명한 신호, 쉬운 행동, 즉각적인 보상이 습관을 키운다.",
  "환경을 설계하면 의지력에 덜 기대게 된다.",
  "완벽함보다 반복이 습관을 만든다.",
];

export function quoteForToday() {
  const dayNumber = Math.floor(Date.now() / 86400000);
  return habitQuotes[dayNumber % habitQuotes.length];
}
