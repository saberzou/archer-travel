import { z } from "zod";

/**
 * What Archer remembers between sessions.
 *
 * Lives in localStorage on the device — no server-side persistence yet.
 * Sent to the chat API on every turn so the model can read it via the
 * system prompt, and patched via the client-side `remember_profile` tool.
 *
 * Privacy note: passport numbers and birthdates are transmitted to the
 * chat endpoint (and from there to the model provider) on every request.
 * The "forget everything" button clears the local copy completely.
 */

export const PassengerSchema = z.object({
  label: z.string().min(1).max(40),
  givenName: z.string().max(80).optional(),
  familyName: z.string().max(80).optional(),
  gender: z.enum(["M", "F", "X"]).optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  nationality: z.string().length(2).optional(),
  passport: z.string().max(40).optional(),
  passportExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().max(120).optional(),
});

export const PreferencesSchema = z.object({
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  seat: z.enum(["window", "aisle", "no_preference"]).optional(),
  meal: z.string().max(80).optional(),
  avoidRedEye: z.boolean().optional(),
  airlinesAvoid: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(400).optional(),
});

export const ProfileSchema = z.object({
  name: z.string().max(80).optional(),
  homeAirport: z.string().length(3).optional(),
  passengers: z.array(PassengerSchema).max(20).optional(),
  preferences: PreferencesSchema.optional(),
});

export type Passenger = z.infer<typeof PassengerSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

const STORAGE_KEY = "archer:profile:v1";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Patch tools send sparse updates — merge instead of overwrite so a single
// "I'm vegetarian" doesn't wipe the passport already on file. Arrays are
// replaced wholesale; an array in the patch is the new array.
export function mergeProfile(base: Profile, patch: Profile): Profile {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      out[key] = { ...existing, ...value };
    } else {
      out[key] = value;
    }
  }
  return out as Profile;
}

export function getProfile(): Profile {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = ProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* quota / private mode — silently drop */
  }
  window.dispatchEvent(new CustomEvent("archer:profile-changed"));
}

export function clearProfile(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("archer:profile-changed"));
}

export function applyProfilePatch(patch: Profile): Profile {
  const next = mergeProfile(getProfile(), patch);
  saveProfile(next);
  return next;
}

export function isProfileEmpty(p: Profile): boolean {
  return Object.keys(p).length === 0;
}
