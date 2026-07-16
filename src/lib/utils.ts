import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizePhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digitsOnly = phone.replace(/\D+/g, "");
  if (!digitsOnly) return null;

  // Ethiopian numbers come back either as 09... or +2519...
  if (digitsOnly.length === 12 && digitsOnly.startsWith("2519")) {
    return `0${digitsOnly.slice(-9)}`;
  }

  if (digitsOnly.length === 10 && digitsOnly.startsWith("09")) {
    return digitsOnly;
  }

  return digitsOnly;
}

/**
 * Strict Ethiopian phone normalization + validation.
 *
 * Accepts common inputs like:
 * - 09XXXXXXXX
 * - 07XXXXXXXX
 * - +2519XXXXXXXX / 2519XXXXXXXX
 * - +2517XXXXXXXX / 2517XXXXXXXX
 *
 * Returns normalized format: exactly 10 digits starting with 09 or 07.
 * Throws an Error with a clear message for invalid inputs.
 */
export function normalizeEthiopianPhoneStrict(input: string): string {
  const raw = String(input ?? "").trim();
  const digitsOnly = raw.replace(/\D+/g, "");

  if (!digitsOnly) {
    throw new Error("Phone number is required.");
  }

  // Normalize from country code format to local 0-prefixed format.
  // Example: +2519XXXXXXXX -> 09XXXXXXXX, +2517XXXXXXXX -> 07XXXXXXXX
  let normalized: string;
  if (digitsOnly.length === 12 && digitsOnly.startsWith("251")) {
    normalized = `0${digitsOnly.slice(3)}`; // drop 251, add leading 0
  } else {
    normalized = digitsOnly;
  }

  if (!/^\d{10}$/.test(normalized)) {
    throw new Error("Invalid phone number format. Expected exactly 10 digits (e.g., 09XXXXXXXX or 07XXXXXXXX).");
  }

  if (!(normalized.startsWith("09") || normalized.startsWith("07"))) {
    throw new Error("Invalid phone number prefix. Phone number must start with 09 or 07.");
  }

  return normalized;
}

export function buildPhoneVariants(phone?: string | null): string[] {
  if (!phone) return [];
  const normalized = normalizePhoneNumber(phone);
  const variants = new Set<string>();
  variants.add(phone);
  if (normalized) variants.add(normalized);
  if (normalized && normalized.startsWith("0") && normalized.length === 10) {
    variants.add(`251${normalized.slice(1)}`);
    variants.add(`+251${normalized.slice(1)}`);
  }
  return Array.from(variants);
}

/**
 * Returns true if the password contains at least one non-alphanumeric character.
 */
export function hasSpecialCharacter(password?: string | null): boolean {
  if (!password) return false;
  return /[^A-Za-z0-9]/.test(password);
}
