const HANDLE = /^[a-z0-9_]{3,24}$/;

export function normalizeHandle(value: string): string {
  const handle = value.trim().toLowerCase();
  if (!HANDLE.test(handle)) throw new Error("Handles use 3–24 lowercase letters, numbers, or underscores.");
  return handle;
}

export function normalizeDisplayName(value: string): string {
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 40) throw new Error("Display names use 1–40 characters.");
  return name;
}

export function normalizeBiography(value: string): string {
  const biography = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (biography.length > 280) throw new Error("Biographies must be 280 characters or fewer.");
  return biography;
}

export function publicProfileView(input: {
  handle: string;
  displayName: string;
  biography: string;
  profilePublic: boolean;
  followers: number;
  following: number;
  isFollowing: boolean;
  activity: { text: string; at: string }[];
}) {
  return {
    handle: input.handle,
    displayName: input.displayName,
    biography: input.profilePublic ? input.biography : "",
    profilePublic: input.profilePublic,
    followers: input.followers,
    following: input.following,
    isFollowing: input.isFollowing,
    activity: input.profilePublic ? input.activity : [],
    privateNote: input.profilePublic ? null : "This member keeps activity private.",
  };
}
