import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { syncUsers } from "@/lib/syncUsers";

/** POST /api/admin/sync-users — sync auth.users into public.users. Requires admin. */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const result = await syncUsers();
  if (result.error) {
    return NextResponse.json({ message: result.error, synced: 0 }, { status: 500 });
  }
  return NextResponse.json({ synced: result.synced });
}

/** GET also allowed for dashboard useEffect fetch. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const result = await syncUsers();
  if (result.error) {
    return NextResponse.json({ message: result.error, synced: 0 }, { status: 500 });
  }
  return NextResponse.json({ synced: result.synced });
}
