import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

/** POST /api/analytics/event */
export async function trackEvent(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;
  const body = req.body as { eventType?: string; payload?: Record<string, unknown> };
  const eventType = typeof body.eventType === 'string' ? body.eventType : 'unknown';
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

  if (!supabase) {
    res.status(503).json({ message: 'Service unavailable' });
    return;
  }

  const { error } = await supabase.from('analytics_events').insert({
    user_id: userId,
    event_type: eventType,
    payload: payload as any,
  });

  if (error) {
    res.status(500).json({ message: 'Failed to track event' });
    return;
  }

  res.status(201).json({ success: true });
}
