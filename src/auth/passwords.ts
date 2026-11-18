/**
 * Password hashing with Argon2id.
 *
 * Parameters follow OWASP's baseline (19 MiB, t=2, p=1). They are encoded in
 * the PHC string, so raising them later does not invalidate old hashes; a
 * successful sign-in can transparently rehash.
 */
import { hash, verify } from "@node-rs/argon2";

export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/** A stable hash used to equalise timing when the email does not exist. */
let dummyHashPromise: Promise<string> | null = null;
export async function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("this-is-not-a-real-user-password");
  return dummyHashPromise;
}

export function passwordProblems(password: string, email: string, displayName: string): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("Use at least 10 characters.");
  if (password.length > 200) problems.push("Use no more than 200 characters.");
  if (!/[A-Za-z]/.test(password)) problems.push("Include at least one letter.");
  if (!/\d/.test(password)) problems.push("Include at least one number.");
  const lower = password.toLowerCase();
  if (lower === "jms123") problems.push("Choose a password other than the starting password.");
  if (email && lower.includes(email.toLowerCase())) problems.push("Do not use your email address as the password.");
  const firstName = displayName.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstName && firstName.length >= 3 && lower.includes(firstName)) {
    problems.push("Do not use your name as the password.");
  }
  return problems;
}
