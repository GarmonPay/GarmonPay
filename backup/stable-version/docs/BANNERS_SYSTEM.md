# Banner Rotator & Banner Creator System

## Overview

- **Rotator**: Displays active banners on dashboard top, ads page, and public homepage. Rotates every 5 seconds. Tracks impressions (on view) and clicks (on click, opens target URL in new tab).
- **Advertiser upload**: Users upload banners at `/dashboard/banners`. Admin must approve before they go live.
- **Referral banner creator**: Pre-designed templates with GarmonPay branding and user referral link. Download PNG or share link. Embed code on referrals page.
- **Admin**: `/admin/banners` — view all, approve, pause, delete. Analytics: impressions, clicks, CTR.

## Database

Run migration `supabase/migrations/20250222120000_banners.sql`:

- **banners**: id, owner_user_id, title, image_url, target_url, type (advertiser | referral | admin), status (pending | active | paused), impressions, clicks, created_at, updated_at

## Storage

Banner images are stored in the existing **ad-media** bucket under path `banners/{userId}/{timestamp}.{ext}`. Ensure the bucket exists in Supabase Dashboard → Storage.

## Security (Phase 9)

- **Target URL**: Only `https:` URLs are accepted. Validated server-side in `POST /api/banners`.
- **Image types**: JPEG, PNG, GIF, WebP only. Max size 2MB. Validated server-side.
- **Auth**: Only the authenticated user can create banners (owner_user_id). Only admin can approve/pause/delete via `/api/admin/banners`.
- **Impressions/clicks**: Recorded server-side via `/api/banners/impression` and `/api/banners/click` (no client-side trust).

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/banners/rotator | List active banners (public) |
| POST | /api/banners/impression | Body: `{ bannerId }` — record impression |
| POST | /api/banners/click | Body: `{ bannerId }` — record click, returns target_url |
| GET | /api/banners | List current user's banners (auth) |
| POST | /api/banners | Create banner: formData title, target_url, file (auth) |
| GET | /api/admin/banners | List all banners (admin) |
| PATCH | /api/admin/banners | Body: `{ id, status }` or `{ id, action: "delete" }` (admin) |

## Test (Phase 11)

1. **Rotator**: Ensure at least one banner is active (admin approves). Visit dashboard, ads page, homepage — rotator appears if there are active banners. Wait 5s to see rotation.
2. **Clicks**: Click a banner — new tab opens target_url; banner clicks increment in DB and in admin/user analytics.
3. **Create banner**: Log in as user → Dashboard → Banners → upload image (JPEG/PNG/GIF/WebP, &lt;2MB), enter HTTPS target URL, Save. Banner appears with status "pending".
4. **Referral link**: On referrals page and dashboard/banners, referral banner creator shows templates. Select template, click Download — PNG downloads with referral link text. Share link copies referral URL.
5. **Admin**: Log in as admin → Banners. Approve a pending banner → status becomes "active". Pause/Activate/Delete work. Impressions, clicks, CTR display correctly.
