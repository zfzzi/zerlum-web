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
  passwordHash?: string;
  passwordSalt?: string;
  authProvider?: "password" | "微信" | "GitHub";
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
  password: string;
}

const USERS_STORAGE_KEY = "zerlum.registeredUsers";
const CURRENT_USER_STORAGE_KEY = "zerlum.currentUserId";
const CURRENT_SESSION_STORAGE_KEY = "zerlum.currentSession";
const SESSION_USER_STORAGE_KEY = "zerlum.sessionUserId";
const DEFAULT_TRIAL_CREDITS = 120;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

function createSalt() {
  const bytes = new Uint8Array(16);

  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fallbackHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function hashPassword(password: string, salt: string) {
  const value = `${salt}:${password}`;

  if (
    typeof crypto !== "undefined" &&
    crypto.subtle &&
    typeof TextEncoder !== "undefined"
  ) {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);

    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }

  return fallbackHash(value);
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

function saveCurrentUserId(userId: string, rememberFor30Days = true) {
  if (!isBrowser()) {
    return;
  }

  if (rememberFor30Days) {
    window.localStorage.setItem(
      CURRENT_SESSION_STORAGE_KEY,
      JSON.stringify({
        userId,
        expiresAt: Date.now() + THIRTY_DAYS_MS
      })
    );
    window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, userId);
    window.sessionStorage.removeItem(SESSION_USER_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(SESSION_USER_STORAGE_KEY, userId);
  window.localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

function upsertUser(profile: UserProfile, rememberFor30Days = true) {
  const users = readUsers();
  const nextUsers = users.some((user) => user.id === profile.id)
    ? users.map((user) => (user.id === profile.id ? profile : user))
    : [profile, ...users];

  writeUsers(nextUsers);
  saveCurrentUserId(profile.id, rememberFor30Days);

  return profile;
}

function buildDemoUser(
  identifier: string,
  authProvider: UserProfile["authProvider"] = "password"
): UserProfile {
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
    authProvider,
    plan: "试用版",
    credits: DEFAULT_TRIAL_CREDITS,
    totalRecharged: 0,
    createdAt: now,
    lastLoginAt: now,
    avatarInitial: getAvatarInitial(username, email, phone),
    rechargeRecords: []
  };
}

function isPasswordCapableUser(user: UserProfile) {
  return Boolean(user.passwordHash && user.passwordSalt);
}

function findUserByIdentifier(users: UserProfile[], identifier: string) {
  const normalizedIdentifier = normalizeIdentity(identifier);

  return users.find(
    (user) =>
      normalizeIdentity(user.email) === normalizedIdentifier ||
      normalizeIdentity(user.phone) === normalizedIdentifier
  );
}

function readSessionUserId() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const rawSession = window.localStorage.getItem(CURRENT_SESSION_STORAGE_KEY);

    if (rawSession) {
      const session = JSON.parse(rawSession);

      if (
        typeof session?.userId === "string" &&
        typeof session?.expiresAt === "number" &&
        session.expiresAt > Date.now()
      ) {
        return session.userId;
      }

      window.localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
  } catch {
    window.localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
  }

  const sessionUserId = window.sessionStorage.getItem(SESSION_USER_STORAGE_KEY);
  if (sessionUserId) {
    return sessionUserId;
  }

  const legacyUserId = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (legacyUserId) {
    saveCurrentUserId(legacyUserId, true);
    return legacyUserId;
  }

  return "";
}

export function getRegisteredUsers() {
  return readUsers();
}

export function loadCurrentUser(): UserProfile | null {
  if (!isBrowser()) {
    return null;
  }

  const currentUserId = readSessionUserId();
  if (!currentUserId) {
    return null;
  }

  const user = readUsers().find((item) => item.id === currentUserId) ?? null;

  if (user && (isPasswordCapableUser(user) || user.authProvider)) {
    return user;
  }

  clearCurrentUser();
  return null;
}

export async function createRegisteredUser(
  input: RegisterUserInput,
  rememberFor30Days = true
): Promise<UserProfile> {
  const users = readUsers();
  const cleanEmail = input.email.trim();
  const cleanPhone = input.phone.trim();
  const now = new Date().toISOString();
  const existingUser = users.find((user) => {
    const sameEmail =
      cleanEmail && normalizeIdentity(user.email) === normalizeIdentity(cleanEmail);
    const samePhone =
      cleanPhone && normalizeIdentity(user.phone) === normalizeIdentity(cleanPhone);

    return sameEmail || samePhone;
  });
  const passwordSalt = createSalt();
  const passwordHash = await hashPassword(input.password, passwordSalt);

  if (existingUser && isPasswordCapableUser(existingUser)) {
    throw new Error("该邮箱或手机号已注册，请直接登录。");
  }

  if (existingUser) {
    return upsertUser(
      {
      ...existingUser,
      username: input.username.trim() || existingUser.username,
      email: cleanEmail || existingUser.email,
      phone: cleanPhone || existingUser.phone,
      passwordHash,
      passwordSalt,
      authProvider: "password",
      lastLoginAt: now,
      avatarInitial: getAvatarInitial(
        input.username.trim() || existingUser.username,
        cleanEmail || existingUser.email,
        cleanPhone || existingUser.phone
      )
      },
      rememberFor30Days
    );
  }

  return upsertUser(
    {
      id: createId("user"),
      username: input.username.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash,
      passwordSalt,
      authProvider: "password",
      plan: "试用版",
      credits: DEFAULT_TRIAL_CREDITS,
      totalRecharged: 0,
      createdAt: now,
      lastLoginAt: now,
      avatarInitial: getAvatarInitial(input.username, cleanEmail, cleanPhone),
      rechargeRecords: []
    },
    rememberFor30Days
  );
}

export async function resolveLoginUser(
  identifier: string,
  password: string,
  rememberFor30Days = true
): Promise<UserProfile> {
  const cleanIdentifier = identifier.trim();
  const users = readUsers();
  const now = new Date().toISOString();
  const existingUser = findUserByIdentifier(users, cleanIdentifier);

  if (!existingUser) {
    throw new Error("账号不存在，请先注册。");
  }

  if (!isPasswordCapableUser(existingUser)) {
    throw new Error("该账号还没有设置密码，请重新注册后再登录。");
  }

  const passwordHash = await hashPassword(password, existingUser.passwordSalt ?? "");

  if (passwordHash !== existingUser.passwordHash) {
    throw new Error("密码不正确，请输入注册时设置的密码。");
  }

  return upsertUser(
    {
      ...existingUser,
      authProvider: "password",
      lastLoginAt: now
    },
    rememberFor30Days
  );
}

export function resolveThirdPartyUser(
  provider: "微信" | "GitHub",
  rememberFor30Days = true
): UserProfile {
  const identifier = provider === "微信" ? "wechat@zerlum.local" : "github@zerlum.local";
  const users = readUsers();
  const existingUser = findUserByIdentifier(users, identifier);

  if (existingUser) {
    return upsertUser(
      {
        ...existingUser,
        authProvider: provider,
        lastLoginAt: new Date().toISOString()
      },
      rememberFor30Days
    );
  }

  return upsertUser(buildDemoUser(identifier, provider), rememberFor30Days);
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
  window.localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_USER_STORAGE_KEY);
}
