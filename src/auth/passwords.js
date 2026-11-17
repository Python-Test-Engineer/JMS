import bcrypt from "bcryptjs";
import { config } from "../config.js";

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password, hash) {
  try { return bcrypt.compareSync(password, hash); } catch { return false; }
}

export function passwordProblems(password, user = {}) {
  const problems = [];
  const value = String(password ?? "");
  if (value.length < 10) problems.push("Use at least 10 characters.");
  if (value.length > 200) problems.push("Use no more than 200 characters.");
  if (!/[A-Za-z]/.test(value)) problems.push("Include at least one letter.");
  if (!/\d/.test(value)) problems.push("Include at least one number.");
  const lowered = value.toLowerCase();
  if (user.email && lowered === String(user.email).toLowerCase()) problems.push("Do not use your email address as the password.");
  if (user.display_name && lowered === String(user.display_name).toLowerCase()) problems.push("Do not use your display name as the password.");
  if (lowered === config.DEFAULT_PASSWORD.toLowerCase()) problems.push("Choose something other than the default password.");
  return problems;
}
