import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

const MIN_WITHDRAWAL_CENTS = 100;

/** POST /api/withdrawals/request */
export async function requestWithdrawal(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  const body = req.body as { amount?: number; paymentMethod?: string; wallet_address?: string };
  const amountCents = typeof body.amount === 'number' ? Math.round(body.amount) : 0;
  const method = ['crypto', 'paypal', 'bank'].includes(body.paymentMethod || '') ? body.paymentMethod : body.wallet_address ? 'crypto' : null;
  const walletAddress = typeof body.wallet_address === 'string' ? body.wallet_address.trim() : '';

  if (amountCents < MIN_WITHDRAWAL_CENTS) {
    res.status(400).json({ message: `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}` });
    return;
  }

  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('balance')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const balanceDollars = Number((user as any).balance ?? 0);
  const balanceCents = Math.round(balanceDollars * 100);
  if (amountCents > balanceCents) {
    res.status(400).json({ message: 'Insufficient balance' });
    return;
  }

  const newBalance = balanceDollars - amountCents / 100;
  const { error: updateError } = await supabase
    .from('users')
    .update({ balance: newBalance })
    .eq('id', userId);

  if (updateError) {
    res.status(500).json({ message: 'Failed to process withdrawal' });
    return;
  }

  const { data: withdrawal, error: insertError } = await supabase
    .from('withdrawals')
    .insert({
      user_id: userId,
      amount: amountCents / 100,
      status: 'pending',
      method: method || 'crypto',
      wallet_address: walletAddress || null,
    })
    .select()
    .single();

  if (insertError) {
    res.status(500).json({ message: 'Failed to create withdrawal request' });
    return;
  }

  res.status(201).json({
    withdrawal,
    message: 'Withdrawal submitted for approval',
  });
}
