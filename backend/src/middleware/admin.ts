/**
 * Requires admin role in public.users (role = 'admin' or is_super_admin = true).
 * Must run after requireAuth.
 */
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as any).userId;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }

  const { data, error } = await supabase
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();

  if (error || !data) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }

  const row = data as { role?: string; is_super_admin?: boolean };
  const isAdmin = (row.role?.toLowerCase() === 'admin') || !!row.is_super_admin;
  if (!isAdmin) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }

  next();
}
