import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  ListChecks,
  LogOut,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { AppUser, Habit, HabitState, HabitTone, LoginMode } from "./types";
import {
  addMonths,
  allWeekdays,
  buildMonthDays,
  formatKoreanDate,
  fromDateKey,
  getMonthTitle,
  getWeekdayLabel,
  toDateKey,
} from "./lib/dates";
import { isSupabaseConfigured, loadRemoteHabitState, saveRemoteHabitState, supabase } from "./lib/supabase";
import {
  clearCurrentUser,
  createInitialHabitState,
  loadCurrentUser,
  loadLocalHabitState,
  loginLocal,
  loginLocalProvider,
  makeId,
  saveCurrentUser,
  saveLocalHabitState,
  signUpLocal,
} from "./lib/storage";
import whaleIcon from "./assets/whale-icon-v4.png";

type TabId = "today" | "habits" | "calendar";
type DragTarget = { type: "date" | "global"; habitId: string; dateKey?: string };

const todayKey = toDateKey(new Date());
const palette = ["#79b8b6", "#c49b70", "#8fac99", "#d28a96", "#8795b2", "#aeb58d"];
const habitWeekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const tabQuotes: Record<TabId, string> = {
  today: "프로와 아마추어의 차이는 하기 싫은 날에도 하는데에 있다.",
  habits: "반복되는 행동이 정체성을 만든다.",
  calendar: "완벽한 하루보다 다시 이어가는 하루가 오래 남는다.",
};
const toneOptions: Array<{ value: HabitTone; label: string }> = [
  { value: "good", label: "좋음" },
  { value: "neutral", label: "중립" },
  { value: "bad", label: "나쁨" },
];

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [habitState, setHabitState] = useState<HabitState>(() => createInitialHabitState());
  const [stateReady, setStateReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [checkDate, setCheckDate] = useState(todayKey);
  const [monthDate, setMonthDate] = useState(new Date());
  const [filterCategory, setFilterCategory] = useState("전체");
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);

  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        if (sessionUser && mounted) {
          setUser(toRemoteUser(sessionUser));
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          const sessionUser = session?.user;
          if (!sessionUser) {
            setUser(null);
            setStateReady(false);
            return;
          }

          setUser(toRemoteUser(sessionUser));
        });

        return () => subscription.unsubscribe();
      }

      const localUser = loadCurrentUser();
      if (localUser && mounted) setUser(localUser);
      return undefined;
    }

    const unsubscribePromise = bootstrapAuth();
    return () => {
      mounted = false;
      unsubscribePromise.then((unsubscribe) => unsubscribe?.());
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const currentUser = user;
    let cancelled = false;
    setStateReady(false);

    async function loadState() {
      try {
        const local = loadLocalHabitState(currentUser.id);
        const remote = currentUser.isRemote ? await loadRemoteHabitState(currentUser.id) : null;
        if (!cancelled) {
          setHabitState(remote ?? local ?? createInitialHabitState());
          setStateReady(true);
        }
      } catch {
        if (!cancelled) {
          setHabitState(loadLocalHabitState(currentUser.id) ?? createInitialHabitState());
          setStateReady(true);
        }
      }
    }

    loadState();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !stateReady) return;

    const currentUser = user;
    saveLocalHabitState(currentUser.id, habitState);

    const timer = window.setTimeout(async () => {
      if (currentUser.isRemote) {
        try {
          await saveRemoteHabitState(currentUser.id, habitState);
        } catch {}
        return;
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [habitState, stateReady, user]);

  useEffect(() => {
    if (!dragTarget) return;

    const clearDragTarget = () => {
      window.setTimeout(() => setDragTarget(null), 0);
    };

    window.addEventListener("pointerup", clearDragTarget);
    return () => window.removeEventListener("pointerup", clearDragTarget);
  }, [dragTarget]);

  const checkHabits = useMemo(() => getHabitsForDate(habitState, checkDate), [habitState, checkDate]);
  const selectedHabits = useMemo(() => getHabitsForDate(habitState, checkDate), [habitState, checkDate]);
  const checkDoneCount = countDone(habitState, checkDate, checkHabits);
  const checkPercent = checkHabits.length ? Math.round((checkDoneCount / checkHabits.length) * 100) : 0;

  function changeGlobalDate(dateKey: string) {
    if (!dateKey) return;
    setCheckDate(dateKey);
    setMonthDate(fromDateKey(dateKey));
  }

  function patchState(recipe: (current: HabitState) => HabitState) {
    setHabitState((current) => recipe(current));
  }

  function toggleCompletion(dateKey: string, habitId: string) {
    patchState((current) => ({
      ...current,
      completions: {
        ...current.completions,
        [dateKey]: {
          ...(current.completions[dateKey] ?? {}),
          [habitId]: !current.completions[dateKey]?.[habitId],
        },
      },
    }));
  }

  function addHabitToDate(dateKey: string, habitId: string) {
    patchState((current) => {
      const override = normalizeOverride(current.dateOverrides[dateKey]);
      const habit = current.habits.find((item) => item.id === habitId);
      if (!habit) return current;

      const scheduled = isHabitScheduledBase(habit, dateKey);
      return {
        ...current,
        dateOverrides: {
          ...current.dateOverrides,
          [dateKey]: {
            add: scheduled ? override.add : unique([...override.add, habitId]),
            remove: override.remove.filter((id) => id !== habitId),
          },
        },
      };
    });
  }

  function removeHabitFromDate(dateKey: string, habitId: string) {
    patchState((current) => {
      const override = normalizeOverride(current.dateOverrides[dateKey]);
      const habit = current.habits.find((item) => item.id === habitId);
      if (!habit) return current;

      const scheduled = isHabitScheduledBase(habit, dateKey);
      const dateCompletions = { ...(current.completions[dateKey] ?? {}) };
      delete dateCompletions[habitId];

      return {
        ...current,
        completions: {
          ...current.completions,
          [dateKey]: dateCompletions,
        },
        dateOverrides: {
          ...current.dateOverrides,
          [dateKey]: {
            add: override.add.filter((id) => id !== habitId),
            remove: scheduled ? unique([...override.remove, habitId]) : override.remove,
          },
        },
      };
    });
  }

  function reorderDateHabits(dateKey: string, insertIndex: number) {
    if (!dragTarget || dragTarget.type !== "date" || dragTarget.dateKey !== dateKey) return;

    const orderedIds = moveIdToIndex(
      getHabitsForDate(habitState, dateKey).map((habit) => habit.id),
      dragTarget.habitId,
      insertIndex,
    );

    patchState((current) => ({
      ...current,
      dateOrders: {
        ...current.dateOrders,
        [dateKey]: orderedIds,
      },
    }));
    setDragTarget(null);
  }

  function reorderGlobalHabits(insertIndex: number, visibleIds: string[]) {
    if (!dragTarget || dragTarget.type !== "global") return;

    const allIds = [...habitState.habits].sort((a, b) => a.order - b.order).map((habit) => habit.id);
    const visibleSet = new Set(visibleIds);
    const reorderedVisible = moveIdToIndex(visibleIds, dragTarget.habitId, insertIndex);
    let visibleCursor = 0;
    const reorderedAllIds = allIds.map((id) => (visibleSet.has(id) ? reorderedVisible[visibleCursor++] : id));

    patchState((current) => ({
      ...current,
      habits: current.habits.map((habit) => ({
        ...habit,
        order: reorderedAllIds.indexOf(habit.id),
      })),
    }));
    setDragTarget(null);
  }

  async function handleLogout() {
    if (supabase && user?.isRemote) {
      await supabase.auth.signOut();
    }
    clearCurrentUser();
    setUser(null);
    setStateReady(false);
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img className="brand-whale" src={whaleIcon} alt="" />
          </div>
          <div>
            <h1>습관 고래</h1>
            <span>{formatKoreanDate(todayKey)}</span>
          </div>
        </div>

        <div className="topbar-actions">
          <AppDateControl dateKey={checkDate} onDateChange={changeGlobalDate} />
          <div className="account-actions">
            <span className="user-pill">{user.name}</span>
            <button className="icon-button" type="button" title="로그아웃" aria-label="로그아웃" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="주요 화면">
        <TabButton active={activeTab === "today"} icon={<Check size={17} />} label="습관 체크" onClick={() => setActiveTab("today")} />
        <TabButton active={activeTab === "habits"} icon={<ListChecks size={17} />} label="습관 리스트" onClick={() => setActiveTab("habits")} />
        <TabButton active={activeTab === "calendar"} icon={<Calendar size={17} />} label="캘린더" onClick={() => setActiveTab("calendar")} />
      </nav>

      <main>
        {activeTab === "today" && (
          <TodayView
            habits={checkHabits}
            state={habitState}
            percent={checkPercent}
            doneCount={checkDoneCount}
            dateKey={checkDate}
            dragTarget={dragTarget}
            onAddHabit={addHabitToDate}
            onRemoveHabit={removeHabitFromDate}
            onToggle={toggleCompletion}
            onDragStart={(habitId) => setDragTarget({ type: "date", habitId, dateKey: checkDate })}
            onDragEnd={() => setDragTarget(null)}
            onDrop={reorderDateHabits}
          />
        )}

        {activeTab === "habits" && (
          <HabitListView
            state={habitState}
            filterCategory={filterCategory}
            dragTarget={dragTarget}
            onFilterCategory={setFilterCategory}
            onPatch={patchState}
            onDragStart={(habitId) => setDragTarget({ type: "global", habitId })}
            onDragEnd={() => setDragTarget(null)}
            onDrop={reorderGlobalHabits}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarView
            state={habitState}
            monthDate={monthDate}
            selectedDate={checkDate}
            selectedHabits={selectedHabits}
            onMonthChange={(amount) => setMonthDate((current) => addMonths(current, amount))}
            onSelectDate={changeGlobalDate}
            onAddHabit={addHabitToDate}
            onRemoveHabit={removeHabitFromDate}
            onToggle={toggleCompletion}
          />
        )}
      </main>

      <footer>{tabQuotes[activeTab]}</footer>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (user: AppUser) => void }) {
  const [mode, setMode] = useState<LoginMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [emailFormOpen, setEmailFormOpen] = useState(false);

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    try {
      if (supabase) {
        if (mode === "signup") {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name: name.trim() || email.split("@")[0] } },
          });
          if (error) throw error;
          setMessage("가입 확인 후 로그인됩니다.");
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return;
      }

      const localUser = mode === "signup" ? signUpLocal(email, password, name) : loginLocal(email, password);
      saveCurrentUser(localUser);
      onLogin(localUser);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    }
  }

  async function handleGoogleLogin() {
    setMessage("");

    if (supabase) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) setMessage(error.message);
      return;
    }

    const localUser = loginLocalProvider("google");
    saveCurrentUser(localUser);
    onLogin(localUser);
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <div className="brand-mark large" aria-hidden="true">
            <img className="brand-whale" src={whaleIcon} alt="" />
          </div>
          <h1>습관 고래</h1>
        </div>

        <div className="provider-row">
          <button type="button" className="provider-button google-button" onClick={handleGoogleLogin}>
            <GoogleLogo />
            <span>Google로 계속하기</span>
          </button>
          <button
            type="button"
            className={emailFormOpen && mode === "login" ? "provider-button email-button active" : "provider-button email-button"}
            onClick={() => {
              setEmailFormOpen(true);
              setMode("login");
              setMessage("");
            }}
          >
            메일로 로그인
          </button>
        </div>

        {emailFormOpen && (
          <>
            <form className="auth-form" onSubmit={handleEmailSubmit}>
              {mode === "signup" && (
                <label>
                  이름
                  <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                </label>
              )}
              <label>
                메일
                <input value={email} type="email" required onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              </label>
              <label>
                비밀번호
                <input
                  value={password}
                  type="password"
                  required
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </label>
              {message && <p className="form-message">{message}</p>}
              <button type="submit" className="primary-button">
                {mode === "login" ? "로그인" : "회원가입"}
              </button>
            </form>

            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? "메일로 회원가입" : "로그인으로 돌아가기"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285f4" d="M21.8 12.23c0-.78-.07-1.53-.2-2.23H12v4.26h5.5a4.7 4.7 0 0 1-2.04 3.08v2.55h3.3c1.92-1.77 3.04-4.37 3.04-7.66Z" />
      <path fill="#34a853" d="M12 22c2.73 0 5.02-.9 6.7-2.45l-3.3-2.55c-.9.6-2.07.97-3.4.97-2.62 0-4.85-1.77-5.64-4.15H2.95v2.63A10.1 10.1 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.36 13.82A6.05 6.05 0 0 1 6.04 12c0-.63.11-1.24.32-1.82V7.55H2.95A10 10 0 0 0 1.9 12c0 1.6.38 3.12 1.05 4.45l3.41-2.63Z" />
      <path fill="#ea4335" d="M12 6.03c1.48 0 2.82.51 3.87 1.52l2.9-2.9C17.02 3.02 14.73 2 12 2a10.1 10.1 0 0 0-9.05 5.55l3.41 2.63C7.15 7.8 9.38 6.03 12 6.03Z" />
    </svg>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? "tab active" : "tab"} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AppDateControl({ dateKey, onDateChange }: { dateKey: string; onDateChange: (dateKey: string) => void }) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => fromDateKey(dateKey));
  const isViewingToday = dateKey === todayKey;
  const pickerDays = useMemo(() => buildMonthDays(pickerMonth), [pickerMonth]);

  useEffect(() => {
    setPickerMonth(fromDateKey(dateKey));
  }, [dateKey]);

  useEffect(() => {
    if (!calendarOpen) return;

    function closeOnOutsideClick(event: MouseEvent | TouchEvent) {
      if (controlRef.current?.contains(event.target as Node)) return;
      setCalendarOpen(false);
    }

    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("touchstart", closeOnOutsideClick);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, [calendarOpen]);

  function moveDate(amount: number) {
    const date = fromDateKey(dateKey);
    date.setDate(date.getDate() + amount);
    onDateChange(toDateKey(date));
  }

  function selectDate(nextDateKey: string) {
    onDateChange(nextDateKey);
    setCalendarOpen(false);
  }

  return (
    <div className="global-date-control" ref={controlRef}>
      <div className="date-stepper" aria-label="전체 날짜 이동">
        <button className="icon-button" type="button" title="이전 날짜" aria-label="이전 날짜" onClick={() => moveDate(-1)}>
          <ChevronLeft size={17} />
        </button>
        <button className="date-display-button" type="button" onClick={() => setCalendarOpen((open) => !open)} aria-expanded={calendarOpen}>
          <span>{formatKoreanDate(dateKey)}</span>
          {isViewingToday && <i>오늘</i>}
        </button>
        <button className="icon-button" type="button" title="다음 날짜" aria-label="다음 날짜" onClick={() => moveDate(1)}>
          <ChevronRight size={17} />
        </button>
      </div>

      {calendarOpen && (
        <div className="date-popover" role="dialog" aria-label="날짜 선택">
          <div className="date-popover-head">
            <button className="icon-button" type="button" title="이전 달" aria-label="이전 달" onClick={() => setPickerMonth((current) => addMonths(current, -1))}>
              <ChevronLeft size={16} />
            </button>
            <strong>{getMonthTitle(pickerMonth)}</strong>
            <button className="icon-button" type="button" title="다음 달" aria-label="다음 달" onClick={() => setPickerMonth((current) => addMonths(current, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-popover-weekdays">
            {allWeekdays.map((day) => (
              <span key={day}>{getWeekdayLabel(day)}</span>
            ))}
          </div>
          <div className="date-popover-grid">
            {pickerDays.map((day) => (
              <button
                key={day.key}
                className={[
                  "date-popover-day",
                  day.isCurrentMonth ? "" : "muted",
                  day.key === dateKey ? "selected" : "",
                  day.key === todayKey ? "today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                onClick={() => selectDate(day.key)}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TodayView({
  habits,
  state,
  percent,
  doneCount,
  dateKey,
  dragTarget,
  onAddHabit,
  onRemoveHabit,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  habits: Habit[];
  state: HabitState;
  percent: number;
  doneCount: number;
  dateKey: string;
  dragTarget: DragTarget | null;
  onAddHabit: (dateKey: string, habitId: string) => void;
  onRemoveHabit: (dateKey: string, habitId: string) => void;
  onToggle: (dateKey: string, habitId: string) => void;
  onDragStart: (habitId: string) => void;
  onDragEnd: () => void;
  onDrop: (dateKey: string, insertIndex: number) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState("전체");
  const addCategories = ["전체", ...state.categories];
  const addedHabitIds = new Set(habits.map((habit) => habit.id));
  const filteredAddHabits = state.habits.filter((habit) => addCategory === "전체" || getHabitCategories(habit).includes(addCategory));
  const draggingHere = dragTarget?.type === "date" && dragTarget.dateKey === dateKey;

  return (
    <section className="today-layout">
      <div className="today-summary">
        <div className="summary-title">
          <h2>습관 체크</h2>
          <p>{formatKoreanDate(dateKey)}</p>
        </div>
        <div className="progress-compact" aria-label={`습관 달성률 ${percent}%`}>
          <strong>{percent}%</strong>
          <div className="progress-track">
            <span style={{ width: `${percent}%` }} />
          </div>
          <em>{doneCount}/{habits.length}</em>
        </div>
        <div className="today-add-area">
          <button className={addOpen ? "add-habit-toggle active" : "add-habit-toggle"} type="button" onClick={() => setAddOpen((open) => !open)}>
            <Plus size={16} />
            습관 추가
          </button>
          {addOpen && (
            <div className="add-picker">
              <div className="add-picker-categories">
                {addCategories.map((category) => (
                  <button
                    key={category}
                    className={addCategory === category ? "chip active" : "chip"}
                    type="button"
                    onClick={() => setAddCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="add-picker-list">
                {filteredAddHabits.map((habit) => (
                  <div className="add-picker-row" key={habit.id}>
                    <div>
                      <strong>{habit.title}</strong>
                      <span>{getHabitCategories(habit).join(" · ")}</span>
                    </div>
                    <button
                      className={addedHabitIds.has(habit.id) ? "mini-add-button added" : "mini-add-button"}
                      type="button"
                      title={addedHabitIds.has(habit.id) ? "추가됨" : "추가"}
                      aria-label={addedHabitIds.has(habit.id) ? `${habit.title} 추가됨` : `${habit.title} 추가`}
                      disabled={addedHabitIds.has(habit.id)}
                      onClick={() => onAddHabit(dateKey, habit.id)}
                    >
                      {addedHabitIds.has(habit.id) ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                ))}
                {!filteredAddHabits.length && <p className="empty-add">추가할 습관이 없습니다.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="today-list-panel">
        <ReorderStack
          active={draggingHere}
          onDropAtPoint={(clientY, container) => {
            if (!dragTarget || dragTarget.type !== "date" || dragTarget.dateKey !== dateKey) return;
            const orderedIds = habits.map((habit) => habit.id);
            const compactIndex = getClosestCompactInsertIndex(container, clientY, dragTarget.habitId);
            onDrop(dateKey, expandCompactInsertIndex(orderedIds, dragTarget.habitId, compactIndex));
          }}
        >
          <DropZone active={draggingHere} onDrop={() => onDrop(dateKey, 0)} />
          {habits.map((habit, index) => (
            <div className="reorder-item" data-reorder-id={habit.id} key={habit.id}>
              <HabitRow
                habit={habit}
                checked={Boolean(state.completions[dateKey]?.[habit.id])}
                completionCount={habitCompletionCount(state, habit.id)}
                draggable
                onDragStart={() => onDragStart(habit.id)}
                onDragEnd={onDragEnd}
                onToggle={() => onToggle(dateKey, habit.id)}
                onRemove={() => onRemoveHabit(dateKey, habit.id)}
              />
              <DropZone active={draggingHere} onDrop={() => onDrop(dateKey, index + 1)} />
            </div>
          ))}
        </ReorderStack>
      </div>
    </section>
  );
}

function HabitListView({
  state,
  filterCategory,
  dragTarget,
  onFilterCategory,
  onPatch,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  state: HabitState;
  filterCategory: string;
  dragTarget: DragTarget | null;
  onFilterCategory: (category: string) => void;
  onPatch: (recipe: (current: HabitState) => HabitState) => void;
  onDragStart: (habitId: string) => void;
  onDragEnd: () => void;
  onDrop: (insertIndex: number, visibleIds: string[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [tone, setTone] = useState<HabitTone>("good");
  const [weekdays, setWeekdays] = useState<number[]>(allWeekdays);
  const [whenNote, setWhenNote] = useState("");
  const [whereNote, setWhereNote] = useState("");
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const editingHabit = state.habits.find((habit) => habit.id === editingHabitId) ?? null;
  const isEditing = Boolean(editingHabit);

  useEffect(() => {
    setSelectedCategories((current) => {
      return current.filter((item) => state.categories.includes(item));
    });
  }, [state.categories]);

  useEffect(() => {
    if (editingHabitId && !state.habits.some((habit) => habit.id === editingHabitId)) {
      setEditingHabitId(null);
    }
  }, [editingHabitId, state.habits]);

  const visibleHabits = [...state.habits]
    .filter((habit) => filterCategory === "전체" || getHabitCategories(habit).includes(filterCategory))
    .sort((a, b) => a.order - b.order);
  const visibleIds = visibleHabits.map((habit) => habit.id);
  const draggingGlobal = dragTarget?.type === "global";

  function saveHabit(event: FormEvent) {
    event.preventDefault();
    const typedCategory = newCategory.trim();
    const finalCategories = unique([...selectedCategories, ...(typedCategory ? [typedCategory] : [])].map((item) => item.trim()).filter(Boolean));
    const primaryCategory = finalCategories[0] ?? "";
    const nextWhenNote = whenNote.trim();
    const nextWhereNote = whereNote.trim();
    if (!title.trim()) return;

    if (editingHabit) {
      onPatch((current) => ({
        ...current,
        categories: unique([...current.categories, ...finalCategories]),
        habits: current.habits.map((habit) =>
          habit.id === editingHabit.id
            ? {
                ...habit,
                title: title.trim(),
                category: primaryCategory,
                categories: finalCategories,
                tone,
                whenNote: nextWhenNote || undefined,
                whereNote: nextWhereNote || undefined,
                weekdays,
                startDate: todayKey,
                endDate: undefined,
                active: true,
              }
            : habit,
        ),
      }));
      resetForm();
      return;
    }

    onPatch((current) => ({
      ...current,
      categories: unique([...current.categories, ...finalCategories]),
      habits: [
        ...current.habits,
        {
          id: makeId("habit"),
          title: title.trim(),
          category: primaryCategory,
          categories: finalCategories,
          tone,
          whenNote: nextWhenNote || undefined,
          whereNote: nextWhereNote || undefined,
          color: palette[current.habits.length % palette.length],
          weekdays,
          startDate: todayKey,
          order: current.habits.length,
          active: true,
        },
      ],
    }));

    resetForm();
  }

  function resetForm() {
    setEditingHabitId(null);
    setTitle("");
    setNewCategory("");
    setSelectedCategories([]);
    setTone("good");
    setWeekdays(allWeekdays);
    setWhenNote("");
    setWhereNote("");
  }

  function startEdit(habit: Habit) {
    setEditingHabitId(habit.id);
    setTitle(habit.title);
    setNewCategory("");
    setSelectedCategories(getHabitCategories(habit));
    setTone(getHabitTone(habit));
    setWeekdays(habit.weekdays);
    setWhenNote(habit.whenNote ?? "");
    setWhereNote(habit.whereNote ?? "");
  }

  function addNewCategory() {
    const value = newCategory.trim();
    if (!value) return;

    onPatch((current) => ({
      ...current,
      categories: unique([...current.categories, value]),
    }));
    setSelectedCategories((current) => unique([...current, value]));
    setNewCategory("");
  }

  function toggleEveryDay(value: number[], onChange: (next: number[]) => void) {
    onChange(isEveryDay(value) ? [] : allWeekdays);
  }

  function deleteHabit(habitId: string) {
    onPatch((current) => ({
      ...current,
      habits: current.habits.filter((habit) => habit.id !== habitId),
      completions: removeHabitFromMap(current.completions, habitId),
      dateOverrides: Object.fromEntries(
        Object.entries(current.dateOverrides).map(([dateKey, override]) => [
          dateKey,
          {
            add: override.add.filter((id) => id !== habitId),
            remove: override.remove.filter((id) => id !== habitId),
          },
        ]),
      ),
      dateOrders: Object.fromEntries(
        Object.entries(current.dateOrders).map(([dateKey, ids]) => [dateKey, ids.filter((id) => id !== habitId)]),
      ),
    }));
  }

  return (
    <section className="screen-grid list-grid">
      <form className={isEditing ? "create-panel editing" : "create-panel"} onSubmit={saveHabit}>
        <div className="form-title-row">
          <div>
            <h2>{isEditing ? "습관 수정하기" : "습관 만들기"}</h2>
            {isEditing && <p className="form-mode-note">수정 중: {editingHabit?.title}</p>}
          </div>
          {isEditing && (
            <button className="small-button ghost-button" type="button" onClick={resetForm}>
              <X size={15} />
              취소
            </button>
          )}
        </div>
        <label>
          습관
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 아침 산책" />
        </label>
        <div className="two-cols cue-fields">
          <label>
            언제
            <input value={whenNote} onChange={(event) => setWhenNote(event.target.value)} placeholder="예: 아침 식사 후" />
          </label>
          <label>
            어디서
            <input value={whereNote} onChange={(event) => setWhereNote(event.target.value)} placeholder="예: 거실 책상" />
          </label>
        </div>
        <div className="form-field category-field">
          <CategoryMultiPicker categories={state.categories} value={selectedCategories} onChange={setSelectedCategories} allowEmpty />
          <div className="category-add-inline">
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addNewCategory();
                }
              }}
              placeholder="새 카테고리"
              aria-label="새 카테고리"
            />
            <button
              className="category-add-button"
              type="button"
              title="카테고리 추가"
              aria-label="카테고리 추가"
              disabled={!newCategory.trim()}
              onClick={addNewCategory}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="form-field tone-field">
          <ToneSelector value={tone} onChange={setTone} />
        </div>
        <div className="repeat-row">
          <span className="repeat-label">반복</span>
          <div className="repeat-options">
            <WeekdayPicker value={weekdays} onChange={setWeekdays} compact />
            <button
              className={isEveryDay(weekdays) ? "everyday-button active" : "everyday-button"}
              type="button"
              onClick={() => toggleEveryDay(weekdays, setWeekdays)}
              aria-pressed={isEveryDay(weekdays)}
            >
              매일
            </button>
          </div>
        </div>
        <button className="primary-button" type="submit">
          {isEditing ? <Pencil size={17} /> : <Plus size={17} />}
          {isEditing ? "수정 완료" : "만들기"}
        </button>
      </form>

      <div className="habit-list-panel">
        <div className="section-head">
          <h2>습관 리스트</h2>
          <div className="category-filter">
            {["전체", ...state.categories].map((item) => (
              <button
                key={item}
                className={filterCategory === item ? "chip active" : "chip"}
                type="button"
                onClick={() => onFilterCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <ReorderStack
          active={draggingGlobal}
          onDropAtPoint={(clientY, container) => {
            if (!dragTarget || dragTarget.type !== "global") return;
            const compactIndex = getClosestCompactInsertIndex(container, clientY, dragTarget.habitId);
            onDrop(expandCompactInsertIndex(visibleIds, dragTarget.habitId, compactIndex), visibleIds);
          }}
        >
          <DropZone active={draggingGlobal} onDrop={() => onDrop(0, visibleIds)} />
          {visibleHabits.map((habit, index) => (
            <div className="reorder-item" data-reorder-id={habit.id} key={habit.id}>
              <HabitListRow
                habit={habit}
                editing={editingHabitId === habit.id}
                completionCount={habitCompletionCount(state, habit.id)}
                draggable
                onDragStart={() => onDragStart(habit.id)}
                onDragEnd={onDragEnd}
                onEdit={() => startEdit(habit)}
                onDelete={() => deleteHabit(habit.id)}
              />
              <DropZone active={draggingGlobal} onDrop={() => onDrop(index + 1, visibleIds)} />
            </div>
          ))}
        </ReorderStack>
      </div>
    </section>
  );
}

function CalendarView({
  state,
  monthDate,
  selectedDate,
  selectedHabits,
  onMonthChange,
  onSelectDate,
  onAddHabit,
  onRemoveHabit,
  onToggle,
}: {
  state: HabitState;
  monthDate: Date;
  selectedDate: string;
  selectedHabits: Habit[];
  onMonthChange: (amount: number) => void;
  onSelectDate: (dateKey: string) => void;
  onAddHabit: (dateKey: string, habitId: string) => void;
  onRemoveHabit: (dateKey: string, habitId: string) => void;
  onToggle: (dateKey: string, habitId: string) => void;
}) {
  const monthDays = buildMonthDays(monthDate);
  const availableHabits = state.habits.filter((habit) => !selectedHabits.some((item) => item.id === habit.id));

  return (
    <section className="screen-grid calendar-grid">
      <div className="calendar-panel">
        <div className="calendar-head">
          <button className="icon-button" type="button" title="이전 달" aria-label="이전 달" onClick={() => onMonthChange(-1)}>
            <ChevronLeft size={18} />
          </button>
          <h2>{getMonthTitle(monthDate)}</h2>
          <button className="icon-button" type="button" title="다음 달" aria-label="다음 달" onClick={() => onMonthChange(1)}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="weekday-row">
          {allWeekdays.map((day) => (
            <span key={day}>{getWeekdayLabel(day)}</span>
          ))}
        </div>

        <div className="month-grid">
          {monthDays.map((day) => {
            const dayHabits = getHabitsForDate(state, day.key);
            const done = countDone(state, day.key, dayHabits);
            const percent = dayHabits.length ? Math.round((done / dayHabits.length) * 100) : 0;
            const style = { "--day-bg": calendarDayColor(percent, dayHabits.length) } as CSSProperties;

            return (
              <button
                key={day.key}
                className={[
                  "day-cell",
                  day.isCurrentMonth ? "" : "muted",
                  selectedDate === day.key ? "selected" : "",
                  day.key === todayKey ? "today" : "",
                  percent === 100 && dayHabits.length ? "complete" : "",
                ].join(" ")}
                style={style}
                type="button"
                onClick={() => onSelectDate(day.key)}
              >
                <span className="day-number">{day.date.getDate()}</span>
                <span className="day-progress">{dayHabits.length ? `${done}/${dayHabits.length}` : "-"}</span>
                <span className="day-percent">{dayHabits.length ? `${percent}%` : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="date-panel">
        <div className="date-panel-head">
          <h2>{formatKoreanDate(selectedDate)}</h2>
          <select
            aria-label="선택 날짜에 습관 추가"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) onAddHabit(selectedDate, event.target.value);
              event.target.value = "";
            }}
          >
            <option value="">습관 추가</option>
            {availableHabits.map((habit) => (
              <option value={habit.id} key={habit.id}>
                {habit.title}
              </option>
            ))}
          </select>
        </div>

        <div className="habit-stack compact">
          {selectedHabits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              checked={Boolean(state.completions[selectedDate]?.[habit.id])}
              completionCount={habitCompletionCount(state, habit.id)}
              onToggle={() => onToggle(selectedDate, habit.id)}
              onRemove={() => onRemoveHabit(selectedDate, habit.id)}
            />
          ))}
        </div>
      </aside>
    </section>
  );
}

function HabitRow({
  habit,
  checked,
  completionCount,
  draggable,
  onToggle,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  habit: Habit;
  checked: boolean;
  completionCount: number;
  draggable?: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const categoryText = getHabitCategories(habit).join(" · ");
  const longPressDrag = useLongPressDrag(habit.id, draggable ? onDragStart : undefined);

  return (
    <article
      className={`${checked ? "habit-row done" : "habit-row"}${longPressDrag.active ? " drag-armed" : ""}`}
      onPointerDown={longPressDrag.onPointerDown}
      onPointerUp={longPressDrag.onPointerUp}
      onPointerCancel={longPressDrag.onPointerCancel}
      onPointerLeave={longPressDrag.onPointerLeave}
    >
      <button className="check-button" type="button" onClick={onToggle} aria-label="달성 여부">
        <Check size={18} />
      </button>
      <div className="habit-row-text">
        <div className="habit-title-line">
          <strong>{habit.title}</strong>
          <HabitCuePills habit={habit} />
        </div>
        <span className="habit-meta">
          <TonePill tone={getHabitTone(habit)} />
          {categoryText && <span className="habit-category-text">{categoryText}</span>}
        </span>
      </div>
      <span className="streak-pill" title="누적 달성 횟수">
        <Flame size={14} />
        {completionCount}
      </span>
      <button className="icon-button danger" type="button" title="제거" aria-label="제거" onClick={onRemove}>
        <Trash2 size={17} />
      </button>
    </article>
  );
}

function HabitListRow({
  habit,
  completionCount,
  editing,
  draggable,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  habit: Habit;
  completionCount: number;
  editing: boolean;
  draggable?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const categoryText = getHabitCategories(habit).join(" · ");
  const longPressDrag = useLongPressDrag(habit.id, draggable ? onDragStart : undefined);

  return (
    <article
      className={`${editing ? "habit-row habit-list-row editing" : "habit-row habit-list-row"}${longPressDrag.active ? " drag-armed" : ""}`}
      onPointerDown={longPressDrag.onPointerDown}
      onPointerUp={longPressDrag.onPointerUp}
      onPointerCancel={longPressDrag.onPointerCancel}
      onPointerLeave={longPressDrag.onPointerLeave}
    >
      <div className="habit-row-text">
        <div className="habit-title-line">
          <strong>{habit.title}</strong>
          <HabitCuePills habit={habit} />
        </div>
        <span className="habit-meta">
          <TonePill tone={getHabitTone(habit)} />
          {categoryText && <span className="habit-category-text">{categoryText}</span>}
        </span>
      </div>
      <span className="streak-pill" title="누적 달성 횟수">
        <Flame size={14} />
        {completionCount}
      </span>
      <button className="icon-button edit-button" type="button" title="습관 수정" aria-label={`${habit.title} 수정`} onClick={onEdit}>
        <Pencil size={17} />
      </button>
      <button className="icon-button danger" type="button" title="삭제" aria-label={`${habit.title} 삭제`} onClick={onDelete}>
        <Trash2 size={17} />
      </button>
    </article>
  );
}

function useLongPressDrag(habitId: string, onDragStart?: (habitId: string) => void) {
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const [active, setActive] = useState(false);

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function finishPress() {
    clearTimer();
    if (!activeRef.current) return;
    window.setTimeout(() => {
      activeRef.current = false;
      setActive(false);
    }, 0);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!onDragStart || isInteractiveTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearTimer();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    timerRef.current = window.setTimeout(() => {
      activeRef.current = true;
      setActive(true);
      onDragStart(habitId);
    }, 1000);
  }

  function onPointerLeave() {
    if (activeRef.current) return;
    clearTimer();
  }

  return {
    active,
    onPointerDown,
    onPointerUp: finishPress,
    onPointerCancel: finishPress,
    onPointerLeave,
  };
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a"));
}

function ReorderStack({
  active,
  children,
  onDropAtPoint,
}: {
  active: boolean;
  children: ReactNode;
  onDropAtPoint?: (clientY: number, container: HTMLDivElement) => void;
}) {
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!active || !onDropAtPoint) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!active || !onDropAtPoint) return;
    event.preventDefault();
    onDropAtPoint(event.clientY, event.currentTarget);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!active || !onDropAtPoint) return;
    if ((event.target as HTMLElement).closest(".drop-zone")) return;
    event.preventDefault();
    onDropAtPoint(event.clientY, event.currentTarget);
  }

  return (
    <div className={active ? "reorder-stack dragging" : "reorder-stack"} onDragOver={handleDragOver} onDrop={handleDrop} onPointerUp={handlePointerUp}>
      {children}
    </div>
  );
}

function DropZone({ active, onDrop }: { active: boolean; onDrop: () => void }) {
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    onDrop();
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    onDrop();
  }

  return (
    <div
      className={active ? "drop-zone active" : "drop-zone"}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerUp={handlePointerUp}
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

function ToneSelector({
  value,
  onChange,
  compact,
}: {
  value: HabitTone;
  onChange: (tone: HabitTone) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "tone-selector compact" : "tone-selector"} role="group" aria-label="습관 성격">
      {toneOptions.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? `tone-option ${option.value} active` : `tone-option ${option.value}`}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TonePill({ tone }: { tone: HabitTone }) {
  const option = toneOptions.find((item) => item.value === tone) ?? toneOptions[0];
  return <i className={`tone-pill ${tone}`}>{option.label}</i>;
}

function HabitCuePills({ habit }: { habit: Habit }) {
  const whenNote = habit.whenNote?.trim();
  const whereNote = habit.whereNote?.trim();
  if (!whenNote && !whereNote) return null;

  return (
    <span className="habit-cue-pills">
      {whenNote && (
        <span className="habit-cue-pill" title={`언제: ${whenNote}`}>
          <Clock size={11} />
          <span>{whenNote}</span>
        </span>
      )}
      {whereNote && (
        <span className="habit-cue-pill" title={`어디서: ${whereNote}`}>
          <MapPin size={11} />
          <span>{whereNote}</span>
        </span>
      )}
    </span>
  );
}

function CategoryMultiPicker({
  categories,
  value,
  onChange,
  compact,
  allowEmpty,
}: {
  categories: string[];
  value: string[];
  onChange: (categories: string[]) => void;
  compact?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <div className={compact ? "category-multi compact" : "category-multi"} role="group" aria-label="습관 카테고리">
      {categories.map((category) => {
        const active = value.includes(category);
        return (
          <button
            key={category}
            className={active ? "category-option active" : "category-option"}
            type="button"
            onClick={() => onChange(toggleCategory(value, category, allowEmpty))}
            aria-pressed={active}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

function WeekdayPicker({
  value,
  onChange,
  compact,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "weekday-picker compact" : "weekday-picker"}>
      {habitWeekdayOrder.map((day) => (
        <button
          key={day}
          className={value.includes(day) ? "weekday active" : "weekday"}
          type="button"
          onClick={() => {
            const next = value.includes(day) ? value.filter((item) => item !== day) : sortWeekdaysByHabitOrder([...value, day]);
            onChange(next);
          }}
        >
          {getWeekdayLabel(day)}
        </button>
      ))}
    </div>
  );
}

function getHabitsForDate(state: HabitState, dateKey: string) {
  const override = normalizeOverride(state.dateOverrides[dateKey]);
  const baseIds = state.habits.filter((habit) => isHabitScheduledBase(habit, dateKey)).map((habit) => habit.id);
  const ids = unique([...baseIds.filter((id) => !override.remove.includes(id)), ...override.add]);
  const orderMap = new Map((state.dateOrders[dateKey] ?? []).map((id, index) => [id, index]));

  return state.habits
    .filter((habit) => ids.includes(habit.id))
    .sort((a, b) => {
      const aOrder = orderMap.has(a.id) ? orderMap.get(a.id)! : a.order + 1000;
      const bOrder = orderMap.has(b.id) ? orderMap.get(b.id)! : b.order + 1000;
      return aOrder - bOrder;
    });
}

function isHabitScheduledBase(habit: Habit, dateKey: string) {
  if (!habit.active) return false;
  if (dateKey < habit.startDate) return false;
  if (habit.endDate && dateKey > habit.endDate) return false;
  return habit.weekdays.includes(fromDateKey(dateKey).getDay());
}

function normalizeOverride(override?: { add: string[]; remove: string[] }) {
  return override ?? { add: [], remove: [] };
}

function countDone(state: HabitState, dateKey: string, habits: Habit[]) {
  return habits.filter((habit) => state.completions[dateKey]?.[habit.id]).length;
}

function habitCompletionCount(state: HabitState, habitId: string) {
  return Object.values(state.completions).filter((dateCompletions) => dateCompletions[habitId]).length;
}

function getHabitTone(habit: Habit): HabitTone {
  return habit.tone ?? "good";
}

function getHabitCategories(habit: Habit) {
  const values = habit.categories?.length ? habit.categories : [habit.category];
  return unique(values.map((category) => category.trim()).filter(Boolean));
}

function toggleCategory(value: string[], category: string, allowEmpty = false) {
  if (value.includes(category)) {
    return value.length > 1 || allowEmpty ? value.filter((item) => item !== category) : value;
  }
  return unique([...value, category]);
}

function sortWeekdaysByHabitOrder(weekdays: number[]) {
  return [...weekdays].sort((a, b) => habitWeekdayOrder.indexOf(a) - habitWeekdayOrder.indexOf(b));
}

function isEveryDay(weekdays: number[]) {
  const selected = new Set(weekdays);
  return allWeekdays.every((day) => selected.has(day));
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function getClosestCompactInsertIndex(container: HTMLElement, clientY: number, sourceId: string) {
  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-reorder-id]")).filter((item) => item.dataset.reorderId !== sourceId);
  if (!items.length) return 0;

  let nextIndex = items.length;
  let nearestDistance = Number.POSITIVE_INFINITY;

  items.forEach((item, index) => {
    const rect = item.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - centerY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nextIndex = clientY < centerY ? index : index + 1;
    }
  });

  return nextIndex;
}

function expandCompactInsertIndex(ids: string[], sourceId: string, compactIndex: number) {
  let visibleCount = 0;

  for (let index = 0; index < ids.length; index += 1) {
    if (ids[index] === sourceId) continue;
    if (visibleCount === compactIndex) return index;
    visibleCount += 1;
  }

  return ids.length;
}

function moveIdToIndex(ids: string[], sourceId: string, insertIndex: number) {
  const next = [...ids];
  const sourceIndex = next.indexOf(sourceId);
  if (sourceIndex < 0) return next;

  const [item] = next.splice(sourceIndex, 1);
  const adjustedIndex = sourceIndex < insertIndex ? insertIndex - 1 : insertIndex;
  next.splice(Math.max(0, Math.min(adjustedIndex, next.length)), 0, item);
  return next;
}

function removeHabitFromMap(map: Record<string, Record<string, boolean>>, habitId: string) {
  return Object.fromEntries(
    Object.entries(map).map(([dateKey, value]) => {
      const next = { ...value };
      delete next[habitId];
      return [dateKey, next];
    }),
  );
}

function calendarDayColor(percent: number, total: number) {
  if (!total || percent <= 0) return "#fffefa";
  if (percent < 34) return "#edf6f2";
  if (percent < 67) return "#d2e9df";
  if (percent < 100) return "#acd5c7";
  return "#7fbab2";
}

function toRemoteUser(sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AppUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? "supabase-user",
    name:
      (sessionUser.user_metadata?.name as string | undefined) ??
      (sessionUser.user_metadata?.full_name as string | undefined) ??
      "사용자",
    provider: "email",
    isRemote: true,
  };
}
