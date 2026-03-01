import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

export async function getWallet(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }
  const { data, error } = await supabase
    .from('users')
    .select('balance, total_deposits')
    .eq('id', userId)
    .single();

  if (error || !data) {
    res.status(404).json({ message: 'Wallet not found' });
    return;
  }
  const balance = Number((data as any).balance ?? 0);
  const totalDeposits = Number((data as any).total_deposits ?? 0);
  res.json({
    balance,
    totalDeposits,
    balanceCents: Math.round(balance * 100),
  });
}
