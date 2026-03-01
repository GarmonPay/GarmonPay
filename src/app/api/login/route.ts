import { POST as loginHandler } from "@/app/api/auth/login/route";

export async function POST(request: Request) {
  return loginHandler(request);
}
