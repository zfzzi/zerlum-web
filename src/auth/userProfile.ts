export type UserPlan = "试用版" | "专业版";

export interface RechargeRecord {
  id: string;
  amount: number;
  createdAt: string;
  channel: "本地演示" | "微信" | "支付宝";
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  phone: string;
  plan: UserPlan;
  credits: number;
  totalRecharged: number;
  createdAt: string;
  lastLoginAt: string;
  avatarInitial: string;
  rechargeRecords: RechargeRecord[];
}

export interface RegisterUserInput {
  username: string;
  email: string;
  phone: string;
}

const USERS_STORAGE_KEY = "zerlum.registeredUsers";
const CURRENT_USER_STORAGE_KEY = "zerlum.currentUserId";
const DEFAULT_TRIAL_CREDITS = 120;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${randomId}`;
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase();
}

function getAvatarInitial(username: string, email: string, phone: string) {
  const cleanName = username.trim();
  if (cleanName) {
    return cleanName.slice(0, 1).toUpperCase();
  }

  const cleanEmail = email.trim();
  if (cleanEmail) {
    return cleanEmail.slice(0, 1).toUpperCase();
  }

  return phone.trim().slice(-2) || "夜";
}

function readUsers(): UserProfile[] {
  if (!isBrowser()) {
    return [];
  }

  try {
    const rawUsers = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (!rawUsers) {
      return [];
    }

    const parsedUsers = JSON.parse(rawUsers);
    return Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch {
    return [];
  }
}

function writeUsers(users: UserProfile[]) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function saveCurrentUserId(userId: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, userId);
}

function upsertUser(profile: UserProfile) {
  const users = readUsers();
  const nextUsers = users.some((user) => user.id === profile.id)
    ? users.map((user) => (user.id === profile.id ? profile : user))
    : [profile, ...users];

  writeUsers(nextUsers);
  saveCurrentUserId(profile.id);

  return profile;
}

function buildDemoUser(identifier: string): UserProfile {
  const now = new Date().toISOString();
  const isEmail = identifier.includes("@");
  const cleanIdentifier = identifier.trim();
  const username = isEmail
    ? cleanIdentifier.split("@")[0] || "夜绘用户"
    : `用户${cleanIdentifier.slice(-4) || "0000"}`;
  const email = isEmail ? cleanIdentifier : "";
  const phone = isEmail ? "" : cleanIdentifier;

  return {
    id: createId("user"),
    username,
    email,
    phone,
    plan: "试用版",
    credits: DEFAULT_TRIAL_CREDITS,
    totalRecharged: 0,
    createdAt: now,
    lastLoginAt: now,
    avatarInitial: getAvatarInitial(username, email, phone),
    rechargeRecords: []
  };
}

export function getRegisteredUsers() {
  return readUsers();
}

export function loadCurrentUser(): UserProfile | null {
  if (!isBrowser()) {
    return null;
  }

  const currentUserId = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!currentUserId) {
    return null;
  }

  return readUsers().find((user) => user.id === currentUserId) ?? null;
}

export function createRegisteredUser(input: RegisterUserInput): UserProfile {
  const users = readUsers();
  const cleanEmail = input.email.trim();
  const cleanPhone = input.phone.trim();
  const now = new Date().toISOString();
  const existingUser = users.find(
    (user) =>
      normalizeIdentity(user.email) === normalizeIdentity(cleanEmail) ||
      normalizeIdentity(user.phone) === normalizeIdentity(cleanPhone)
  );

  if (existingUser) {
    return upsertUser({
      ...existingUser,
      username: input.username.trim() || existingUser.username,
      email: cleanEmail || existingUser.email,
      phone: cleanPhone || existingUser.phone,
      lastLoginAt: now,
      avatarInitial: getAvatarInitial(
        input.username.trim() || existingUser.username,
        cleanEmail || existingUser.email,
        cleanPhone || existingUser.phone
      )
    });
  }

  return upsertUser({
    id: createId("user"),
    username: input.username.trim(),
    email: cleanEmail,
    phone: cleanPhone,
    plan: "试用版",
    credits: DEFAULT_TRIAL_CREDITS,
    totalRecharged: 0,
    createdAt: now,
    lastLoginAt: now,
    avatarInitial: getAvatarInitial(input.username, cleanEmail, cleanPhone),
    rechargeRecords: []
  });
}

export function resolveLoginUser(identifier: string): UserProfile {
  const cleanIdentifier = identifier.trim();
  const normalizedIdentifier = normalizeIdentity(cleanIdentifier);
  const users = readUsers();
  const now = new Date().toISOString();
  const existingUser = users.find(
    (user) =>
      normalizeIdentity(user.email) === normalizedIdentifier ||
      normalizeIdentity(user.phone) === normalizedIdentifier
  );

  if (existingUser) {
    return upsertUser({
      ...existingUser,
      lastLoginAt: now
    });
  }

  return upsertUser(buildDemoUser(cleanIdentifier));
}

export function addUserCredits(userId: string, amount: number): UserProfile | null {
  const users = readUsers();
  const user = users.find((item) => item.id === userId);

  if (!user) {
    return null;
  }

  const rechargeRecord: RechargeRecord = {
    id: createId("recharge"),
    amount,
    createdAt: new Date().toISOString(),
    channel: "本地演示"
  };

  const updatedUser: UserProfile = {
    ...user,
    plan: user.plan === "试用版" ? "专业版" : user.plan,
    credits: user.credits + amount,
    totalRecharged: user.totalRecharged + amount,
    rechargeRecords: [rechargeRecord, ...user.rechargeRecords].slice(0, 8)
  };

  return upsertUser(updatedUser);
}

export function consumeUserCredits(userId: string, amount: number): UserProfile | null {
  const users = readUsers();
  const user = users.find((item) => item.id === userId);

  if (!user || user.credits < amount) {
    return null;
  }

  return upsertUser({
    ...user,
    credits: user.credits - amount,
    lastLoginAt: new Date().toISOString()
  });
}

export function clearCurrentUser() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}
