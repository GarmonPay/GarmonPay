/**
 * In-memory auth store for foundation only.
 * Production: replace with database (users table, sessions table).
 */

export type UserRole = "member" | "admin";

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  referralCode: string;
  referredByCode: string | null;
  createdAt: string;
  is_super_admin?: boolean;
}

const users = new Map<string, StoredUser>();

/** Safe role access for backward compatibility. */
export function getUserRole(user: StoredUser): UserRole {
  return user.role ?? "member";
}

/** True if user is super admin (full access; cannot be deleted or role-changed by normal admin). */
export function isSuperAdmin(user: StoredUser): boolean {
  return !!(user as StoredUser & { is_super_admin?: boolean }).is_super_admin;
}

/** True if target user is super admin (protected from deletion and role change by normal admin). */
export function isProtectedUser(userId: string): boolean {
  const user = users.get(userId);
  return user ? isSuperAdmin(user) : false;
}

/** True if user has admin access (admin role or super admin). */
export function hasAdminAccess(user: StoredUser): boolean {
  return getUserRole(user) === "admin" || isSuperAdmin(user);
}

export function findUserByEmail(email: string): StoredUser | undefined {
  const normalized = email.toLowerCase().trim();
  return Array.from(users.values()).find((u) => u.email.toLowerCase() === normalized);
}

export function findUserById(id: string): StoredUser | undefined {
  return users.get(id);
}

export function createUser(data: {
  id: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  referralCode: string;
  referredByCode?: string | null;
  is_super_admin?: boolean;
}): StoredUser {
  const user: StoredUser = {
    role: "member",
    referredByCode: null,
    ...data,
    createdAt: new Date().toISOString(),
  };
  users.set(data.id, user);
  return user;
}

function generateId(): string {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function createUserWithEmailPassword(
  email: string,
  passwordHash: string,
  referredByCode?: string | null,
  role: UserRole = "member"
): StoredUser {
  const id = generateId();
  const referralCode = generateReferralCode();
  return createUser({
    id,
    email,
    passwordHash,
    role,
    referralCode,
    referredByCode: referredByCode ?? null,
  });
}

/** List all users (for admin). */
export function listUsers(): StoredUser[] {
  return Array.from(users.values());
}

/** Set user role (admin only). Fails if target is super admin (super admin cannot be modified by normal admin). */
export function setUserRole(userId: string, role: UserRole): StoredUser | undefined {
  const user = users.get(userId);
  if (!user) return undefined;
  if (isProtectedUser(userId)) return undefined;
  user.role = role;
  return user;
}
