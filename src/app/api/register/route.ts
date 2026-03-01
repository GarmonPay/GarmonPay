import { POST as registerHandler } from "@/app/api/auth/register/route";

export async function POST(request: Request) {
  return registerHandler(request);
}
