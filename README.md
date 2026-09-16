# Estate Settler

> A calm, private web app to help two people navigate the logistics of settling a personal estate after the death of a parent.

## Overview

Estate Settler is a self-hosted tool built for the specific, overwhelming period that follows a bereavement. It combines a **contact manager**, **task tracker**, and **project organiser** into one place so that nothing falls through the cracks while you're dealing with everything else.

Designed for **two users** (e.g., siblings) sharing the workload, the app runs on a local [Unraid](https://unraid.net) server and is accessed through a **Cloudflare Zero Trust** tunnel — no public sign-up, no cloud database, no third-party SaaS.

> **Design principle:** Calm, clear, low-cognitive-load UI. This is a grief-adjacent tool used during one of life's most stressful periods. Every screen should reduce anxiety, not add to it.

---

## Key Features

### 📇 Institutions & Contacts
- Add and manage organisations that need to be notified of the death — DWP, HMRC, pension providers, banks, utility companies, councils, etc.
- Status tags per contact: `Not Contacted` → `In Progress` → `Awaiting Response` → `Resolved`
- Full contact details, reference numbers, and free-text notes per institution.

### 📝 Interaction History
- Log every phone call, email, letter, or web form against each contact.
- Each entry is **automatically timestamped** and **tagged with the logged-in user** (via Cloudflare Zero Trust identity — no manual selection required).
- Attach screenshots, PDFs, and scanned documents to any history entry.

### ⏰ Deadlines & Timeline
- Track hard legal and administrative deadlines (e.g., registering the death within 5 days, Inheritance Tax at 6 months, probate timelines).
- Visual "upcoming deadlines" dashboard so nothing is missed.

### ✅ Checklist Templates
- Pre-built UK-centric checklists seeded on first run (e.g., "Tell Us Once" service, notifying banks, redirecting post, cancelling subscriptions, DVLA).
- Fully editable — add, remove, or reassign tasks between the two users.

### ⚰️ Funeral Arrangements (Project)
- Dedicated project space for funeral logistics.
- Track funeral directors, celebrants, caterers, florists, venues, and other suppliers.
- Interaction history and document attachments per supplier, same as the main contact manager.

### ⚖️ Probate & Estate Settlement (Project)
- List and categorise assets (property, savings, investments, possessions) and liabilities (mortgages, loans, debts).
- Running **assets vs. liabilities summary** — useful when completing IHT forms.
- Export asset/liability lists to **CSV / spreadsheet format** for solicitors or HMRC.
- Dedicated contacts section for solicitors, probate registries, and financial advisors.

### 🗄️ Document Vault
- Central store for critical documents: death certificates, the Will, Grant of Probate, property deeds, etc.
- Categorised and searchable, with the ability to attach files to specific contacts or projects as well.

### 📊 Activity Feed
- Chronological feed of all actions across the app (e.g., *"Sarah called Scottish Power — 14 Jun 10:32"*).
- Auto-attributed to the acting user. Prevents duplicate effort and "did you already handle that?" conversations.

### ⚡ Quick Capture
- Prominent "quick add note" button available from any screen.
- Auto-timestamps and auto-assigns to the current user — designed for when you're on the phone and need to jot down a reference number *right now*.

### 📱 PWA / Mobile Support
- Installable as a Progressive Web App on phones and tablets.
- Responsive UI that is equally comfortable on a laptop, desktop, or mobile device.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| ORM | Drizzle |
| Database | SQLite (`better-sqlite3`) |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| PWA | `@ducanh2912/next-pwa` |
| Auth | Cloudflare Zero Trust (header-based) |
| Deployment | Docker on Unraid |

---

## Authentication

There is **no built-in login system**. The app sits behind a [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/) tunnel with Google identity provider configured.

- Cloudflare authenticates the user via their Google account before the request ever reaches the app.
- The user's email is passed to the app via the `Cf-Access-Authenticated-User-Email` request header.
- Next.js middleware reads this header to identify the current user.
- Both authorised users have **full access** to all features; the identity is used solely for **attribution** (who created a note, who completed a task, etc.).

---

## Deployment

The app is designed to run as a single Docker container on a local **Unraid** server.

```bash
# Example (details TBD)
docker run -d \
  --name estate-settler \
  -p 3005:3005 \
  -v /mnt/user/appdata/estate-settler/data:/app/data \
  estate-settler:latest
```

- The SQLite database file lives in the mapped `/app/data` volume.
- Back up this directory regularly (e.g., via Unraid's CA Backup plugin or a cron job running `sqlite3 .backup`).

---

## Data & Privacy

- **All data stays on your local network.** Nothing is sent to a third-party database or SaaS provider.
- The only external service involved is Cloudflare (for the Zero Trust tunnel and Google authentication).
- Uploaded documents (PDFs, screenshots) are stored locally alongside the database.
- **Backup this data.** It is irreplaceable.

---

## Project Status

🚧 **Early development.** This project is being built iteratively to meet an immediate real-world need.

### Roadmap (approximate)

- [ ] Core contact manager with interaction history
- [ ] Cloudflare Zero Trust user identification
- [ ] Task assignment and status tracking
- [ ] Funeral arrangements project
- [ ] Probate & estate settlement project with asset/liability tracking
- [ ] Document vault and file uploads
- [ ] Deadline tracker
- [ ] CSV/spreadsheet export
- [ ] PWA manifest and offline-read support
- [ ] Activity feed and quick capture
- [ ] UK checklist templates

---

## Getting Started (Development)

```bash
# Clone the repo
git clone https://github.com/dougalbob/estate-settler.git
cd estate-settler

# Install dependencies
npm install

# Set up the local database
npm run db:push

# Seed UK checklist templates (first run)
npm run db:seed

# Start the dev server
npm run dev
```

> **Note:** During local development without Cloudflare Zero Trust, the app will fall back to a mock user header. See `.env.example` for configuration.

---

## Licence

Private / personal use. Not intended for public distribution at this time.
