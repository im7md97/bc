import bcrypt from "bcryptjs";

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    return bcrypt.compareSync(password, stored);
  } catch {
    return false;
  }
}
