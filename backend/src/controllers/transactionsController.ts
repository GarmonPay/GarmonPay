import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

export async function getTransactions(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));

  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, amount, status, description, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    res.status(500).json({ message: 'Failed to fetch transactions' });
    return;
  }

  res.json({
    transactions: (data || []).map((row: any) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      amountCents: Math.round(Number(row.amount || 0) * 100),
      status: row.status,
      description: row.description,
      createdAt: row.created_at,
    })),
  });
}
