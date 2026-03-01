/**
 * Verifies Supabase Auth JWT and returns user id.
 * Expects Authorization: Bearer <access_token>
 */
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  if (!url || !anonKey) {
    res.status(503).json({ message: 'Auth not configured' });
    return;
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  (req as any).userId = user.id;
  (req as any).userEmail = user.email;
  next();
}
