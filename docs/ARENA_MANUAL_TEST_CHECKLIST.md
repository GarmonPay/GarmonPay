# Arena — Manual Test Checklist

Use this list to test every feature in order, from creating a fighter through to the admin dashboard.  
**Test on:** **https://garmonpay.com** (no localhost).

**Prerequisites:** Migrations applied (`npx supabase link` then `npx supabase db push`, or use `scripts/run-migrations.sh` with `DATABASE_URL`). For real-time fights, the fight server must be running (deployed or `npm run fight-server` locally with your env pointing at production).

---

## 1. Auth & Arena entry

- [ ] **1.1** Log in (or register) at **https://garmonpay.com/login** (or `/register`).
- [ ] **1.2** Go to **Dashboard** and open **Arena**: **https://garmonpay.com/dashboard/arena**.
- [ ] **1.3** If you have no fighter: you see “Create Fighter — Enter the Arena”. If you already have one: you see the hub with My Fighter, Training Gym, Find Fight, etc.

---

## 2. Create fighter (Step 1 — Training Gym prerequisite)

- [ ] **2.1** Click **Create Fighter — Enter the Arena** (or go to **https://garmonpay.com/dashboard/arena/create**).
- [ ] **2.2** Enter name, style, avatar (and any other required fields), submit.
- [ ] **2.3** Confirm you are redirected and see **My Fighter** with stats (e.g. strength, speed, wins, training sessions).

---

## 3. Training Gym (Step 1)

- [ ] **3.1** From hub, open **Training Gym**: **https://garmonpay.com/dashboard/arena/train**.
- [ ] **3.2** Confirm balance/wallet is shown and sessions 1–4 (e.g. Heavy Bag, Speed Drills, 5AM Roadwork, Defense Mitts) are available; sessions 5–6 (War Sparring, Combo Lab) are locked until you have enough previous sessions.
- [ ] **3.3** Run a training session (e.g. Heavy Bag). Confirm wallet is charged and you see a result (stat gain, cap 99, “Total sessions: X”).
- [ ] **3.4** If applicable, confirm a signature-unlock toast when you cross a threshold.
- [ ] **3.5** Confirm sessions 5 and 6 unlock after completing the required number of sessions.

---

## 4. Tap-to-punch fight (Step 2)

- [ ] **4.1** Start fight server in another terminal: `npm run fight-server` (or ensure it’s already running).
- [ ] **4.2** From hub, open **Find Fight**: **https://garmonpay.com/dashboard/arena/fight**.
- [ ] **4.3** Confirm list of CPU opponents (e.g. Brutus, Shadow, Tank, …). Optional: use **weight class** filter if you added matchmaking.
- [ ] **4.4** Create a fight vs one CPU. Confirm you get a fight screen with two fighters, health bars, and 8 action buttons (JAB, RIGHT_HAND, HOOK, etc.).
- [ ] **4.5** Tap actions; confirm server resolves exchanges, health decreases, log updates, and (if supported) vibration on hit.
- [ ] **4.6** Finish the fight (win or lose). Confirm result and that **My Fighter** stats (wins/losses/win_streak) updated.

---

## 5. AI opponent (Step 3)

- [ ] **5.1** On Find Fight, use the option to **Fight AI Opponent** (or equivalent).
- [ ] **5.2** Confirm pre-fight screen with AI name, taunt, 🤖 badge, and “Start Fight”.
- [ ] **5.3** Start the fight and complete it; confirm behavior is similar to CPU fight (tap-to-punch, server resolution).

---

## 6. Spectator mode & betting (Step 4)

- [ ] **6.1** From hub, open **Watch Live**: **https://garmonpay.com/dashboard/arena/spectate**.
- [ ] **6.2** Confirm lobby lists live fights (or “No live fights” if none).
- [ ] **6.3** With another account/device (or a second fight in another tab), create a fight so one fight is live. In the first account, open **Watch Live** again and click a live fight.
- [ ] **6.4** On the watch page, if **betting is open**, place a spectator bet (choose fighter, amount). Confirm success message or error if invalid.
- [ ] **6.5** After the first exchange, confirm betting closes (no new bets). Watch the fight to completion.
- [ ] **6.6** If you bet on the winner, confirm payout (e.g. wallet or coins) and that admin 10% / winners 90% is applied as designed.

---

## 7. Store with Stripe (Step 5)

- [ ] **7.1** From hub, open **Store**: **https://garmonpay.com/dashboard/arena/store**.
- [ ] **7.2** Confirm categories and items (Gloves, Shoes, Shorts, Headgear, Special, Titles, Recovery, Training Camp, Arena Coins).
- [ ] **7.3** Open **My Fighter** and note **Owned** and **Equipped** slots (gloves, shoes, shorts, headgear).
- [ ] **7.4** Buy an item with **Arena Coins** (if you have enough). Confirm balance decreases and item appears in Owned; equip it and confirm Equipped updates.
- [ ] **7.5** Buy an item with **Stripe** (e.g. a coin pack or a gear item). Complete checkout in test mode; confirm webhook grants item/coins and inventory/balance update.
- [ ] **7.6** Start a fight and confirm equipped gear is applied (e.g. stat bonuses in fight if implemented).

---

## 8. Tournaments (Step 6)

- [ ] **8.1** From hub, open **Tournaments**: **https://garmonpay.com/dashboard/arena/tournaments**.
- [ ] **8.2** Confirm list of open tournaments (e.g. Daily Free Roll, Weekly $5, Monthly $20, VIP $50) with entry cost and “Join” / “Bracket”.
- [ ] **8.3** Join a **Daily** (coins) tournament if you have enough coins; or join a **Weekly** ($5) if you have wallet balance. Confirm “Joined” or entry count increases.
- [ ] **8.4** When 8 players have joined (or you simulate 8 entries), confirm bracket auto-starts: status “in_progress”, first-round matches created.
- [ ] **8.5** Open a tournament’s **Bracket**: **https://garmonpay.com/dashboard/arena/tournaments/[id]** (replace [id] with tournament id). Confirm rounds and matches; for live tournament fights, confirm **Watch** links to spectate.
- [ ] **8.6** Complete a tournament fight (as player or spectator). Confirm bracket advances (semi, final) and winner/runner-up/semi get payouts; admin 15% is recorded.
- [ ] **8.7** Optional: place a **spectator bet** on a tournament fight from the spectate page and confirm payout when the fight ends.

---

## 9. Season Pass (Step 7)

- [ ] **9.1** From hub, open **Season Pass**: **https://garmonpay.com/dashboard/arena/season-pass**.
- [ ] **9.2** Confirm copy: $9.99/month, perks (double login coins, extra spin, 10% store discount, VIP access, exclusive title), cancel anytime.
- [ ] **9.3** Click **Subscribe — $9.99/mo**; complete Stripe Checkout in test mode (use test card). Confirm redirect back and status “Active” and list of perks.
- [ ] **9.4** Buy a **store item with coins**; confirm 10% discount is applied (e.g. 100 → 90 coins).
- [ ] **9.5** Confirm **VIP tournament** allows free entry (or join a VIP event without paying entry).
- [ ] **9.6** Click **Manage / Cancel**; confirm Stripe Customer Portal opens. Cancel subscription in portal; confirm status eventually becomes inactive (webhook or next load).

---

## 10. Daily engagement (Step 8)

- [ ] **10.1** From hub, open **Daily**: **https://garmonpay.com/dashboard/arena/daily**.
- [ ] **10.2** **Login bonus:** Click **Claim** (if not already claimed today). Confirm coins granted and streak (Day 1–7) and “Claimed today”. With Season Pass, confirm amount is doubled.
- [ ] **10.3** **Spin:** Click **Spin**. Confirm prize (e.g. 10–100 coins) and “Spins left” decreases. With Season Pass, confirm 2 spins per day.
- [ ] **10.4** **Jackpot:** Confirm current week’s jackpot total is shown (2% of spectator pots). Optional: run cron **https://garmonpay.com/api/cron/arena-jackpot** (with auth header) on a Friday to pay winner; confirm a user receives coins.
- [ ] **10.5** **Win streak:** Win 3, 5, then 10 fights in a row; confirm streak bonuses (e.g. 50, 100, 250 coins) are granted.
- [ ] **10.6** **Referral:** Register a new user with a referral code (or attach referral). Confirm referrer receives 500 arena coins (and optional ledger/notification).

---

## 11. Achievements & weight classes (Step 9)

- [ ] **11.1** From hub, open **Achievements**: **https://garmonpay.com/dashboard/arena/achievements**.
- [ ] **11.2** Confirm list of achievements (First Victory, Five Wins, Dedicated, On Fire, etc.) with coin rewards and unlocked/locked state.
- [ ] **11.3** Click **Check for new achievements**. After meeting a condition (e.g. first win, 5 training sessions), confirm new achievement unlocks and coins granted.
- [ ] **11.4** Open **My Fighter** (or **https://garmonpay.com/api/arena/me**); confirm **weight class** (Light/Middle/Heavy/Unlimited) and **total stats** are shown.
- [ ] **11.5** On Find Fight, use **weight class** filter (if UI exposed); confirm only CPUs in that class are listed.

---

## 12. Admin dashboard (Step 10)

- [ ] **12.1** Log in as **admin** and open **Arena** in admin: **https://garmonpay.com/admin/arena**.
- [ ] **12.2** Confirm **earnings** cards: Fight cuts, Spectator, Tournament, Store, Coin sales, Season pass, Withdrawal fees, **Total**.
- [ ] **12.3** Confirm **stats**: fight count, spectator bet count, active season pass count.
- [ ] **12.4** Confirm **Recent earnings** table and **Payout queue** (e.g. pending withdrawals).
- [ ] **12.5** Confirm **Jackpot** (recent weeks) and **Tournaments** (recent) tables.
- [ ] **12.6** Open **Security** link; confirm main security events / locked accounts. Open **Arena security**; confirm velocity and same-IP accounts (if any activity was logged).

---

## 13. Anti-cheat & legal (Step 11)

- [ ] **13.1** From hub, open **Fair Play & Legal**: **https://garmonpay.com/dashboard/arena/legal**. Confirm anti-cheat, verification, and legal notice text.
- [ ] **13.2** Trigger **rate limits:** e.g. 30+ training requests in 1 minute, or 20+ fight creates; confirm 429 Too Many Requests and optional Retry-After header.
- [ ] **13.3** As admin, open **Arena security**: **https://garmonpay.com/admin/arena/security**. Confirm **High-velocity users** and **Same-IP accounts** tables (after some activity).

---

## Quick reference — Arena routes (all at https://garmonpay.com)

| Feature           | URL                                              | API / Server              |
|------------------|--------------------------------------------------|---------------------------|
| Hub              | https://garmonpay.com/dashboard/arena            | `GET /api/arena/me`       |
| Create fighter   | https://garmonpay.com/dashboard/arena/create     | -                         |
| My fighter       | https://garmonpay.com/dashboard/arena/fighter    | `GET /api/arena/me`       |
| Training         | https://garmonpay.com/dashboard/arena/train      | `POST /api/arena/train`   |
| Find fight       | https://garmonpay.com/dashboard/arena/fight      | fights/create + fight server |
| Spectate         | https://garmonpay.com/dashboard/arena/spectate   | fights/live, spectator-bet |
| Store            | https://garmonpay.com/dashboard/arena/store      | store/items, inventory, checkout, buy, equip |
| Tournaments      | https://garmonpay.com/dashboard/arena/tournaments| tournaments, join, start  |
| Season Pass      | https://garmonpay.com/dashboard/arena/season-pass| season-pass, checkout, portal |
| Daily            | https://garmonpay.com/dashboard/arena/daily      | daily-login, spin, jackpot |
| Achievements     | https://garmonpay.com/dashboard/arena/achievements| achievements, check       |
| Fair Play & Legal| https://garmonpay.com/dashboard/arena/legal      | -                         |
| Admin Arena      | https://garmonpay.com/admin/arena                | `GET /api/admin/arena/overview` |
| Admin Arena Security | https://garmonpay.com/admin/arena/security   | `GET /api/admin/arena/security` |

---

**Note:** All testing is on **https://garmonpay.com**. Ensure `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_ARENA_WS_URL` (and any Stripe/Supabase env) point at production so the site and fight server use the same backend.
