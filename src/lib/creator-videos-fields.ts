import type { TargetDemo } from "@/lib/watch-earn";

const URL_RE = /^https?:\/\/.+/i;

export function parseVideoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed && URL_RE.test(trimmed) ? trimmed : null;
}

export function parseOptionalUrl(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return URL_RE.test(trimmed) ? trimmed : null;
}

export function parseTitle(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
}

export function parseBudgetGpc(raw: unknown): number {
  if (typeof raw === "number") return Math.floor(raw);
  if (typeof raw === "string") return Math.floor(Number(raw));
  return 0;
}

export function parseTargetDemo(raw: unknown): TargetDemo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const demo: TargetDemo = {};

  if (src.age_min != null && src.age_min !== "") {
    const n = Number(src.age_min);
    if (Number.isFinite(n)) demo.age_min = Math.floor(n);
  }
  if (src.age_max != null && src.age_max !== "") {
    const n = Number(src.age_max);
    if (Number.isFinite(n)) demo.age_max = Math.floor(n);
  }
  if (typeof src.gender === "string" && src.gender.trim()) {
    demo.gender = src.gender.trim().slice(0, 32);
  }
  if (Array.isArray(src.interests)) {
    demo.interests = src.interests
      .map((i) => (typeof i === "string" ? i.trim() : ""))
      .filter(Boolean)
      .slice(0, 20);
  } else if (typeof src.interests === "string" && src.interests.trim()) {
    demo.interests = src.interests
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  return Object.keys(demo).length ? demo : null;
}

export function targetDemoFromRow(raw: TargetDemo | null | undefined) {
  return {
    ageMin: raw?.age_min != null ? String(raw.age_min) : "",
    ageMax: raw?.age_max != null ? String(raw.age_max) : "",
    gender: raw?.gender ?? "",
    interests: Array.isArray(raw?.interests) ? raw.interests.join(", ") : "",
  };
}

export function buildTargetDemo(fields: {
  ageMin: string;
  ageMax: string;
  gender: string;
  interests: string;
}): TargetDemo | null {
  return parseTargetDemo({
    age_min: fields.ageMin || undefined,
    age_max: fields.ageMax || undefined,
    gender: fields.gender || undefined,
    interests: fields.interests || undefined,
  });
}
