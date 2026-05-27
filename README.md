# WATI-style WhatsApp Business Panel

Full-stack WhatsApp Business Cloud API panel (contacts, chat, media, voice notes, templates, reactions, typing, 24h session window, call-status, comments).

- **Backend**: Node.js + Express + MongoDB (Mongoose) + Socket.IO + Cloudinary + Meta Graph API
- **Frontend**: React (Vite) + TailwindCSS + Socket.IO client

## Quick start (local)

```bash
# 1. Backend
cd backend
cp .env.example .env            # fill values (already prefilled for you)
npm install
npm run dev                     # http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

## Meta webhook setup

Expose backend with a public URL (Render deploy, or `ngrok http 5000` for local).
In Meta App Dashboard → WhatsApp → Configuration:

- **Callback URL**: `https://<your-backend>/api/webhook`
- **Verify Token**: value of `META_VERIFY_TOKEN` in `.env`
- Subscribe to fields: `messages`, `message_template_status_update`

## Deployment

- **Backend** → Render (see `backend/render.yaml`)
- **Frontend** → Vercel (see `frontend/vercel.json`)
- **Database** → DigitalOcean Managed MongoDB ($15/mo basic). Create cluster → copy connection URI → set `MONGO_URI` in Render env.

## Security

Credentials in this repo's `.env` are provided for development only. Rotate them before production and never commit `.env` files.
