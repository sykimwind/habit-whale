import type { AppUser, AuthProvider, HabitState } from "../types";

type LocalAccount = {
  id: string;
  email: string;
  name: string;
  password: string;
  provider: AuthProvider;
};

const accountsKey = "habit-whale-accounts";

function getAccounts(): LocalAccount[] {
  const raw = localStorage.getItem(accountsKey);
  return raw ? (JSON.parse(raw) as LocalAccount[]) : [];
}

function saveAccounts(accounts: LocalAccount[]) {
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function signUpLocal(email: string, password: string, name: string): AppUser {
  const accounts = getAccounts();
  const normalizedEmail = email.trim().toLowerCase();
  if (accounts.some((account) => account.email === normalizedEmail)) {
    throw new Error("이미 가입된 메일입니다.");
  }

  const account: LocalAccount = {
    id: makeId("user"),
    email: normalizedEmail,
    name: name.trim() || normalizedEmail.split("@")[0],
    password,
    provider: "email",
  };

  saveAccounts([...accounts, account]);
  return toAppUser(account);
}

export function loginLocal(email: string, password: string): AppUser {
  const normalizedEmail = email.trim().toLowerCase();
  const account = getAccounts().find(
    (item) => item.email === normalizedEmail && item.password === password,
  );

  if (!account) throw new Error("메일 또는 비밀번호가 맞지 않습니다.");
  return toAppUser(account);
}

export function loginLocalProvider(provider: "google"): AppUser {
  const accounts = getAccounts();
  const email = `${provider}@habit-whale.local`;
  const existing = accounts.find((account) => account.email === email);

  if (existing) return toAppUser(existing);

  const account: LocalAccount = {
    id: makeId(provider),
    email,
    name: "Google 사용자",
    password: "",
    provider,
  };

  saveAccounts([...accounts, account]);
  return toAppUser(account);
}

export function saveCurrentUser(user: AppUser) {
  localStorage.setItem("habit-whale-current-user", JSON.stringify(user));
}

export function loadCurrentUser(): AppUser | null {
  const raw = localStorage.getItem("habit-whale-current-user");
  return raw ? (JSON.parse(raw) as AppUser) : null;
}

export function clearCurrentUser() {
  localStorage.removeItem("habit-whale-current-user");
}

export function loadLocalHabitState(userId: string): HabitState | null {
  const raw = localStorage.getItem(stateKey(userId));
  return raw ? (JSON.parse(raw) as HabitState) : null;
}

export function saveLocalHabitState(userId: string, state: HabitState) {
  localStorage.setItem(stateKey(userId), JSON.stringify(state));
}

export function createInitialHabitState(): HabitState {
  return {
    categories: [],
    habits: [],
    completions: {},
    dateOverrides: {},
    dateOrders: {},
  };
}

function stateKey(userId: string) {
  return `habit-whale-state:${userId}`;
}

function toAppUser(account: LocalAccount): AppUser {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    provider: account.provider,
    isRemote: false,
  };
}
