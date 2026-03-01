import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

/** POST /api/rewards/credit — credit reward to user wallet (e.g. after ad view). */
export async function creditReward(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  const body = req.body as { userId?: string; amount?: number; eventType?: string };
  const targetUserId = body.userId || userId;
  const amount = typeof body.amount === 'number' ? body.amount : 0;
  const eventType = typeof body.eventType === 'string' ? body.eventType : 'reward';

  if (amount <= 0) {
    res.status(400).json({ message: 'Invalid amount' });
    return;
  }

  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('balance, total_deposits')
    .eq('id', targetUserId)
    .single();

  if (userError || !user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const balance = Number((user as any).balance ?? 0);
  const totalDeposits = Number((user as any).total_deposits ?? 0);
  const amountDollars = amount / 100;
  const newBalance = balance + amountDollars;
  const newTotalDeposits = totalDeposits + amountDollars;

  const { error: updateError } = await supabase
    .from('users')
    .update({ balance: newBalance, total_deposits: newTotalDeposits })
    .eq('id', targetUserId);

  if (updateError) {
    res.status(500).json({ message: 'Failed to credit reward' });
    return;
  }

  await supabase.from('transactions').insert({
    user_id: targetUserId,
    type: 'reward',
    amount: amountDollars,
    status: 'completed',
    description: eventType,
  });

  res.json({ success: true, newBalance, amountCents: amount });
}
