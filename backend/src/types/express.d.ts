import type { User } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        token: string;
        user: User;
        role: string;
        isSuperAdmin: boolean;
      };
    }
  }
}

export {};
