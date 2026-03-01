import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

export async function getProfile(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }
  const { data, error } = await supabase
    .from('users')
    .select('id, email, balance, total_deposits, created_at, role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    res.status(404).json({ message: 'Profile not found' });
    return;
  }
  res.json({
    id: data.id,
    email: (data as any).email,
    balance: Number((data as any).balance ?? 0),
    totalDeposits: Number((data as any).total_deposits ?? 0),
    createdAt: (data as any).created_at,
    role: (data as any).role,
  });
}
