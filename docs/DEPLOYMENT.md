# Deploying ChatDesk

How ChatDesk runs in production, and how to set it up or update it.

| Part | Where | Address |
|---|---|---|
| Django API | AWS EC2 (Ubuntu 24.04, t3.micro), **Sydney `ap-southeast-2`**, HTTPS by nginx + Let's Encrypt | `https://<yourname>.duckdns.org/api/v1` |
| Database | Neon project **ChatDeskDB** (`late-resonance-66906722`), AWS **Sydney** | (private connection string) |
| Admin dashboard (`web/`) | Cloudflare Pages | `https://<dashboard>.pages.dev` |
| Student app, web version (`mobile/`), for iPhone users | Cloudflare Pages | `https://<student-app>.pages.dev` |
| Student app, Android | Expo build pointed at the API address | (n/a) |

```
Browser / phone --HTTPS--> <yourname>.duckdns.org (Elastic IP)
    --> EC2: nginx (HTTPS) -> gunicorn (Django) --SSL--> Neon ChatDeskDB (same region)
Cloudflare Pages (dashboard, student web app) --HTTPS--> the API
```

**Region:** the AWS account is on the **Free plan**, which runs in **Sydney**
only (other regions need a paid upgrade). Neon is in Sydney too, so the
server and database sit in the same region. Create everything in Sydney.

**Money:** the Free plan can't charge the card; usage comes out of the $200
credits (valid until Nov 11, 2027). ChatDesk uses about $15 a month.

**Secrets never go into this repo (it's public):** Neon connection strings,
the OpenAI key, the Gmail App Password and `SECRET_KEY` live only in
`/srv/chatdesk/backend/.env` on the server and in the Cloudflare/Neon
dashboards.

There's also a spare copy of the database in Singapore
(`ChatDeskDB-Singapore-backup`, `autumn-queen-99712732`); nothing uses it.

---

## 0. Before you start

- Production deploys from **`main`**. Merge `develop` into `main` first.
- The database **ChatDeskDB** (Sydney) is ready: tables created, and the
  offices, FAQs, phases, announcements and staff accounts copied from the local
  database (`manage.py copy_reference_data`). Staff log in with their existing
  passwords.
- Have these ready: the Neon pooled and direct connection strings (Neon console
  → ChatDeskDB → **Connect**), the OpenAI API key, and the ChatDesk Gmail App
  Password.

## 1. Security group: the server's firewall (AWS console → EC2, Sydney)

**EC2 → Security Groups → Create security group**
- Name: `chatdesk-api`, VPC: the default one
- Inbound rules:
  - **SSH (22)**, source **Custom** → prefix list `com.amazonaws.ap-southeast-2.ec2-instance-connect` (the browser terminal)
  - **HTTP (80)**, source **Anywhere-IPv4** (needed for the certificate and for redirecting to HTTPS)
  - **HTTPS (443)**, source **Anywhere-IPv4**
- Outbound: leave the default (all traffic)

## 2. EC2 server

**EC2 → Launch instance**
- Name: `chatdesk-api`
- OS image: **Ubuntu Server 24.04 LTS**, 64-bit (x86) (Free tier eligible)
- Instance type: **t3.micro** (Free tier eligible)
- Key pair: **Proceed without a key pair**. You'll use EC2 Instance Connect in the browser.
- Network settings → **Select existing security group** → `chatdesk-api`
- Storage: **10 GiB gp3**
- **Launch instance**

## 3. Elastic IP: a fixed address

**EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**, then
**Actions → Associate Elastic IP address** → Instance `chatdesk-api` → **Associate**.

Note the IP, e.g. `3.25.1.2`. Keep it associated: an Elastic IP left
unattached still costs credits.

## 4. DuckDNS name

1. Go to **duckdns.org** and sign in (GitHub or Google).
2. Type a name, e.g. `chatdesk-ustp`, and click **add domain**.
3. In its **current ip** box, enter the Elastic IP and click **update ip**.
4. Your address is `chatdesk-ustp.duckdns.org`. The Elastic IP never changes,
   so no update script is needed.

## 5. Install ChatDesk on the server

1. Select the instance → **Connect → EC2 Instance Connect → Connect**.
2. Paste this into the terminal:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/666tetsuyaaa/CHATDESK2/main/deploy/aws/setup_server.sh | bash
   ```
   It installs Python, nginx, certbot and git, adds swap, downloads the code to
   `/srv/chatdesk`, creates the API service, and schedules the daily
   overdue-ticket reminder (8:00 AM Manila).
3. Fill in the settings:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # copy this for SECRET_KEY
   nano /srv/chatdesk/backend/.env
   ```
   Replace every `<...>` (see the notes in the file). Use your DuckDNS name for
   `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` and `PUBLIC_BASE_URL`. Leave the
   Cloudflare addresses until step 7. Save with **Ctrl+O, Enter, Ctrl+X**.
4. Start the API:
   ```bash
   bash /srv/chatdesk/deploy/aws/update.sh
   ```
   It should end with **"API is up."**

## 6. HTTPS (Let's Encrypt, free)

```bash
bash /srv/chatdesk/deploy/aws/enable_https.sh chatdesk-ustp.duckdns.org you@example.com
sudo systemctl restart chatdesk
```

It checks that the DuckDNS name points at this server, gets the certificate,
turns on HTTP→HTTPS redirect, and tests automatic renewal.

**Check it:**
- `https://chatdesk-ustp.duckdns.org/api/v1/phases/current/` should show an
  "authentication" error in JSON. That means it works, since the endpoint needs a login.
- `https://chatdesk-ustp.duckdns.org/admin/` should show the Django admin login.

## 7. Cloudflare Pages: dashboard and student web app

Create **two** Pages projects from the same GitHub repo (**Workers & Pages →
Create → Pages → Connect to Git** → `666tetsuyaaa/CHATDESK2`). The repo owner
may need to approve Cloudflare's access on GitHub.

| Setting | Admin dashboard | Student web app |
|---|---|---|
| Project name | e.g. `chatdesk-admin` | e.g. `chatdesk-app` |
| Production branch | `main` | `main` |
| Root directory | `web` | `mobile` |
| Build command | `npm run build` | `npm run build:web` |
| Build output directory | `dist` | `dist` |
| Environment variables | `VITE_API_BASE_URL` = `https://chatdesk-ustp.duckdns.org/api/v1`, `NODE_VERSION` = `22` | `EXPO_PUBLIC_API_BASE_URL` = `https://chatdesk-ustp.duckdns.org/api/v1`, `NODE_VERSION` = `22` |

After both deploy, add their addresses to the server's `.env`, then run
`sudo systemctl restart chatdesk`:
- `CORS_ALLOWED_ORIGINS=https://chatdesk-admin.pages.dev,https://chatdesk-app.pages.dev`
- `ADMIN_DASHBOARD_URL=https://chatdesk-admin.pages.dev`

The API address is built into both sites. If it changes, redeploy them in
Cloudflare (**Deployments → Retry deployment**).

## 8. Android app

Set `EXPO_PUBLIC_API_BASE_URL=https://chatdesk-ustp.duckdns.org/api/v1` in
`mobile/.env` before running or building the app (Expo Go or an EAS build).

## 9. Test the live system

- [ ] Admin dashboard: log in with an existing Super Admin account. Tickets, FAQs, Analytics and Phases load.
- [ ] Student web app on an **iPhone in Safari**: sign up, then ask an FAQ question. Ask something no FAQ covers, so it makes a ticket.
  - [ ] The message box stays above the keyboard.
  - [ ] **Share → Add to Home Screen** shows "ChatDesk" with the icon.
- [ ] Android app: log in, chat, open Tickets.
- [ ] Email: "Forgot password" sends a code to a real inbox.
- [ ] Staff answer a ticket on the dashboard; the student sees it and gets the email.
- [ ] Profile picture upload works and the picture still shows after `update.sh`.

## Everyday operations (on the server)

| Task | Command |
|---|---|
| Deploy the latest `main` | `bash /srv/chatdesk/deploy/aws/update.sh` |
| API logs | `sudo journalctl -u chatdesk -f` |
| Reminder log | `cat /srv/chatdesk/logs/reminders.log` |
| Try the reminder now (no emails) | `cd /srv/chatdesk/backend && venv/bin/python manage.py send_overdue_reminders --dry-run` |
| Restart after editing `.env` | `sudo systemctl restart chatdesk` |
| Certificate status | `sudo certbot certificates` |

Cloudflare Pages rebuilds both sites by itself on every push to `main`.

## Costs (all from the $200 credits, Free plan)

- **EC2 t3.micro + Elastic IP + 10 GiB disk:** about $15 a month.
- **DuckDNS and Let's Encrypt:** free.
- **Neon (Free):** 1 GB storage, 100 compute-hours a month, and it sleeps when idle. The first request after a quiet spell takes about a second longer.
- **Cloudflare Pages (Free):** 500 builds a month.
- **OpenAI:** billed separately per chat message. Keep a monthly limit set in the OpenAI dashboard.

To save credits when nobody needs the system for a while, **stop** the EC2
instance (EC2 → Instance state → Stop) and start it again before use. The
Elastic IP keeps the address the same. Delete everything (instance, Elastic IP,
volume) before the credits expire on **Nov 11, 2027**.
