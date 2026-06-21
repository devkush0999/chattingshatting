# Friend Circle Chat

A private Next.js + Supabase chatting app for a small friend circle of up to 10 users.

## Features

- Supabase email/password auth
- Max 10 user cap enforced in the database
- Realtime one-to-one chat
- Typing indicators
- Delete chat history for yourself
- Delete your own messages for everyone
- Online-style friend list from approved profiles
- WebRTC video calling and screen sharing with Supabase realtime signaling
- Row Level Security policies for private one-to-one data

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key.
4. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Calls use peer-to-peer WebRTC. On different networks you may need a TURN server for reliable connectivity.
- The database allows only 10 rows in `profiles`. Keep signups invite-only by sharing the app privately and leaving Supabase email confirmations enabled.
