# Bare Beauty by Ionee: website, booking and studio panel

Everything runs on Netlify's free plan. No database account, no booking subscription. The only required cost is the domain.

- Public site: `/` (landing page, menu, Instagram posts), `/book/` (online booking), `/appointment/` (a client's own view and cancel link)
- Policy pages: `/privacy/`, `/terms/` (booking terms) and `/accessibility/`, linked in every footer and in the booking form
- Studio panel for Ionee: `/admin/` (requests, schedule, clients, menu, hours, texts, photos, Instagram, privacy tools, backups)
- API: one Netlify Function at `/api/*`. Data lives in Netlify Blobs on the same site.
- Scheduled functions: a daily job (reminder emails, clean-up) and an Instagram sync every 6 hours.
- Optional: booking emails through Resend (free tier), a calendar feed for her phone.

## What it costs

| Item | Cost | Notes |
|---|---|---|
| Netlify Free | $0 | New accounts get 300 credits a month. A production deploy is 15 credits, bandwidth 20 credits per GB, web requests 2 credits per 10,000. Hard cap: if credits run out, Netlify pauses the site until next month. |
| Domain at Cloudflare | about $10.46 a year for a .com | Cloudflare sells at cost. Check the price at checkout. |
| Instagram API | $0 | Reading her own posts needs no paid plan and no app review. |
| Resend (optional) | $0 | 100 emails a day, 3,000 a month on the free plan. |
| Cloudflare Email Routing (optional) | $0 | hello@yourdomain forwards to Ionee's Gmail. |

How far 300 credits go (estimate): the home page is about 115 KB and 12 requests before photos. Six Instagram posts add about 250 KB, but only for visitors who scroll down to them. That works out to roughly 20,000 visits a month with a couple of deploys. Netlify counts resized Instagram images as bandwidth today and has said Image CDN pricing may change, so check the usage page in Netlify now and then. Accounts created before September 4, 2025 may still be on the older free plan, which counts usage differently.

Content edits in the panel cost nothing. Only code deploys spend the 15 credits, so batch code changes.

## 1. Put it on GitHub and Netlify

1. Create a private GitHub repo (for example `bare-beauty-site`) and push this folder to it. `node_modules` and `.netlify` are already in `.gitignore`.
2. In Netlify: Add new project, then Import an existing project, then pick the repo. Netlify reads `netlify.toml`, so leave the build settings as they are (publish folder `public`, functions folder `netlify/functions`, no build command).
3. Before the first deploy, open Project configuration, then Environment variables, and add:
   - `ADMIN_PASSWORD`: a long password, at least 8 characters. This is your master key to the panel. Ionee sets her own password inside the panel later; both work.
4. Deploy. Open `https://<your-site>.netlify.app/admin/` and sign in with `ADMIN_PASSWORD`.

Use Git (above) or the Netlify CLI (`npm install`, then `netlify deploy --prod`). Both build the functions. Don't rely on a drag-and-drop upload for this project.

Environment variable changes only apply after a new deploy (Deploys, then Trigger deploy).

## 2. Connect the Cloudflare domain

1. Buy the domain in Cloudflare Registrar (for example `barebeautybyionee.com`). Cloudflare domains keep their DNS at Cloudflare, so you add records there instead of moving DNS to Netlify.
2. In Netlify: Domain management, then Add a domain, then enter the domain. Choose to keep DNS where it is (external DNS).
3. In Cloudflare DNS, add these records. Set both to DNS only (grey cloud):

| Type | Name | Target |
|---|---|---|
| CNAME | `@` | `apex-loadbalancer.netlify.com` |
| CNAME | `www` | `<your-site>.netlify.app` |

   Cloudflare flattens a CNAME at the root automatically. Netlify's fallback for the root is an A record to `75.2.60.5` if you prefer.
4. Back in Netlify, wait for DNS verification and the free HTTPS certificate. This can take a few minutes to a few hours. Make the root domain the primary domain.
5. If the domain is not `barebeautybyionee.com`, run `node scripts/set-domain.mjs yourdomain.com`, then commit and push. It updates the social preview image link, sitemap, robots file and the policy pages' canonical links.

Why DNS only: Netlify issues and renews the HTTPS certificate and already serves the site from its CDN. A second CDN in front adds caching surprises and nothing Ionee needs.

## 3. Booking emails (optional, about 10 minutes)

Without this, the site still works. New requests show on the panel's Today screen with a badge, in the calendar feed, and the panel checks for new bookings every minute while it's open.

1. Cloudflare Email Routing: forward `hello@yourdomain` to Ionee's Gmail.
2. Resend: create a free account, add the domain, and click Sign in to Cloudflare to add the DNS records automatically (MX and TXT on `send`, TXT on `resend._domainkey`). It does not touch the Email Routing records.
3. Create a Resend API key with sending access.
4. Add these Netlify environment variables, then trigger a deploy:
   - `RESEND_API_KEY`: the key from step 3
   - `MAIL_FROM`: `Bare Beauty by Ionee <hello@yourdomain>`
   - `NOTIFY_EMAIL` (optional): where booking alerts go. If empty, they go to the studio email set in the panel.
5. In the panel: Settings, Calendar, Send me a test email.

What gets sent once email is on:

- Ionee: every new booking or request, and every client cancellation.
- Clients who give an email: request received or booked, confirmed, declined, cancelled, and a reminder the day before (sent daily at 13:00 UTC, which is 9 AM Eastern in summer and 8 AM in winter). Every email links to the booking terms and privacy policy.

## 4. Instagram feed (optional, about 15 minutes, once)

Her latest posts fill "Recent work" on the home page and refresh every 6 hours. It uses Instagram's official API for her own account. No app review, no business verification and no paid plan are needed for that. Instagram has no way for a site to pull posts without this one-time permission.

Before you start, her Instagram must be a professional account (Creator or Business). In the Instagram app: Settings, Account type and tools, Switch to professional account. It's free and she can switch back.

1. Go to developers.facebook.com and sign in with any Facebook account (yours is fine). Click Create app.
2. Give it a name (like "Bare Beauty website") and a contact email. For use cases, open Others and pick Create an app without a use case. Don't connect a business portfolio. Click through to Create app.
3. On the app's dashboard: Add use cases, filter by Content management, pick Manage messaging & content on Instagram, Save, then Add to this app.
4. Open that use case (Customize). On the API setup with Instagram business login page, click Add all required permissions.
5. Add Ionee's Instagram as a tester: App roles, Roles, Add People, Instagram Tester, type her Instagram username, Add.
6. Ionee accepts: on instagram.com in a browser, Settings, Apps and websites, the Tester invites tab, Accept.
7. Back on the API setup page, under Generate access tokens: Add account, sign in as her Instagram, then expand the account and click Generate token. Tick I understand and copy the token. It's shown only once. If you lose it, generate a new one.
8. In the studio panel: Settings, Instagram, paste the token, Connect Instagram. Posts appear within a few minutes.

After that it runs on its own. The token lasts 60 days and the site renews it automatically every few days, so it never runs out while the site is live. The token stays in the site's private storage and is never sent to a browser.

What visitors get: the photos are resized and served from your own domain by Netlify Image CDN, so the page stays fast and visitors' browsers never contact Instagram. Reels show their cover image. Each tile links to the post. If Instagram can't be reached for 3 days, the site quietly falls back to the photos uploaded in Settings, Photos (Instagram's photo links expire after a few days, so old ones aren't shown). Settings, Instagram shows the last update and any problem, and the Today screen flags it too.

If it stops working: the most common cause is a changed Instagram password or switching the account back to personal. Generate a new token (steps 7 and 8) and connect again.

## 5. Before you share the link

Go through these with Ionee. The site shows placeholders until they're done, and the panel's Today screen has the same checklist.

- Hours: I set Tuesday to Friday 10 to 6 and Saturday 9 to 3 as a starting point.
- Phone, studio email, the public area (shown) and the studio address (only sent to confirmed clients).
- Service lengths. Facials come from her printed menu. Waxing and lash times are my estimates: upper lip and chin 10 min, underarms 15, half leg, bikini and full face 30, full leg 45, classic set 2 hr, hybrid set 2 hr 30, classic fill 1 hr, hybrid fill 1 hr 15, lash lift 1 hr. Booking slots depend on these.
- Policies and prep tips. The defaults are common salon practice (24 hours' notice to cancel, 15 minutes late, prep for each service). She needs to confirm them.
- The policy pages (see Privacy and compliance below). Read all three with her, and have someone who knows her state's rules review them.
- The About text. It's a draft in her voice.
- Requests or instant booking. It starts in request mode: she confirms every booking.
- Payment note, for example the payment apps she accepts.
- Her own password, a portrait for the About section, and Instagram connected (or a few photos of her work).
- The calendar link on her phone (Settings, Calendar).
- Add the panel to her home screen: open `/admin/` in Safari, tap Share, then Add to Home Screen.

`IONEE-GUIDE.md` is a plain-language guide you can send her.

## Privacy and compliance

This isn't legal advice, and I'm not a lawyer. The pages and tools below are a careful starting point for a small US studio. Have someone who knows her state's rules look them over before launch.

What's built in:

- Privacy policy (`/privacy/`), booking terms (`/terms/`) and an accessibility statement (`/accessibility/`), written in Ionee's voice. They fill in her business name, contact details, cancel cutoff, payment note and how long records are kept from the panel, so they stay accurate when she changes settings.
- At booking, clients must tick "I agree to the booking terms". The appointment records which version they agreed to and when (`terms` on the appointment, plus a line in its history).
- A separate, optional "Text me about openings and offers" box. A yes is saved on the client with the date and source. Ionee can also mark a yes given in person, or a STOP, on the client's page. Personal "time for your next visit" texts still go to past clients unless they opted out (the privacy policy says so). Clients who opted out lose the Text button in "Due to come back".
- Appointment texts are sent by Ionee by hand from her phone, never automatically.
- Client data requests: each client's page has Download their data (a JSON copy of everything kept about them) and Erase their details (removes them from the client list and blanks their name, contact details and notes on every appointment, keeping only date, services and price for her books). Erasing waits until upcoming appointments are cancelled.
- Retention: Settings, Privacy sets how long records are kept after a client's last visit (3 years by default, or anywhere from 1 to 7 years, or until she erases them). On the 1st of each month the daily job erases anyone past the limit. Today shows a heads-up before that happens. If her state board requires keeping client records for a minimum time, set at least that.
- No cookies for visitors, no analytics, no ads or tracking pixels, fonts self-hosted, Instagram images served from her own domain. The only browser storage on the public site is one session note so the opening animation plays once per visit.
- Rate limits keep only a keyed hash of the visitor's IP address (HMAC with the site's secret), deleted within two days by the daily job.
- The calendar feed carries first name, last initial and services only, because calendar apps copy it to their own servers. Phone numbers, emails and notes stay in the panel.
- One person per record: when two bookings share an email but have different phone numbers (a mother and daughter, say), they stay separate clients. The panel, exports and erasing all follow the same rule.

Things to decide with Ionee, then edit the pages to match:

- The under-18 rule (terms and privacy): a parent or guardian books for clients under 18.
- The no-show line: repeat no-shows may be asked to book by text instead of online.
- Patch tests for lash services ("may need a patch test first").
- Photo consent: she only posts photos that show a client with their permission.
- The governing law line names "the state where the studio is located". You can name the state.

How to change the pages: they're plain HTML in `public/privacy/index.html`, `public/terms/index.html` and `public/accessibility/index.html`. When you change the privacy policy or the booking terms, update the "Last updated" date on the page and `POLICY_VERSION` in `netlify/lib/defaults.mjs` to the same date, so new bookings record the new version. Then deploy.

## Motion

The home page opens with the ring light switching on, the name coming into focus and the BY IONEE strip opening from the middle. After that the ring keeps a soft glow, menu rows and photos animate in as you scroll, the band under the hero slides with scrolling, and the booking pages answer each tap. All of it is skipped for anyone with reduced motion turned on in their phone or computer settings.

The code is `public/assets/js/motion.js` and the Motion sections at the end of `site.css` and `book.css`. `public/assets/js/intro.js` shortens the opening to a quick fade the second time someone lands on the home page in a visit.

## How it works

- Pages are plain HTML, CSS and JavaScript in `public/`. No build step.
- `netlify/functions/api.mjs` serves every `/api/*` route: site data, open times, booking, a client's appointment view and cancel, the calendar feed, photos, Instagram, privacy tools and everything else the panel does.
- `netlify/functions/daily.mjs` runs daily: rate-limit clean-up, the retention check (and the monthly erase), and reminder emails when email is on.
- `netlify/functions/instagram-sync.mjs` runs every 6 hours: renews the Instagram token when it's due and pulls the latest posts. `netlify/lib/instagram.mjs` holds the Instagram code.
- Data is a few JSON documents in the Netlify Blobs store `bare-beauty`: `settings`, `services`, `clients`, `blocks`, `media`, `auth`, `instagram` (token and status), `instagram-feed` (posts), `privacy-check`, and one `appts/YYYY-MM` document per month. Writes use ETag checks and re-read to confirm, so two people booking the same time at once can't both get it.
- The landing page ships with the menu baked into the HTML (for speed and search engines), then swaps in the live menu from `/api/site`. If you change `netlify/lib/defaults.mjs`, run `node scripts/render-static.mjs`.
- Open times follow her weekly hours, the cleanup buffer after each visit, time off, the shortest notice (in real hours, so daylight saving changes don't shorten it) and how far ahead clients can book. All of it is set in the panel.

## Security

- `ADMIN_PASSWORD` (yours) and Ionee's own password both open the panel. Hers is stored as a scrypt hash. Saving a new password signs out every other device.
- Sessions last 30 days. Settings, Password has Sign out everywhere else.
- Login is limited to 10 tries per 15 minutes per connection, and booking to 8 per hour, plus a hidden bot field. The limits hold even when many requests arrive at once.
- Client view and cancel links are signed, so nobody can guess another client's link.
- The calendar feed link is secret. Settings has a button to make a new one.
- The Instagram token is stored privately and never sent to a browser. Only Instagram's own image servers are allowed as image sources.
- Every page sends a strict Content Security Policy. The panel and appointment pages are marked noindex.

## Working on it locally

```
npm install
npm install -g netlify-cli
ADMIN_PASSWORD=pick-a-test-password netlify dev
```

Then in another terminal, with the same password:

```
ADMIN_PASSWORD=pick-a-test-password npm test
```

The test books, double-books, races six people for one time, confirms, moves an appointment across months, cancels with the client link, records consent and offer-text choices, downloads and erases a client, finds and erases old records, and checks the calendar feed. It refuses to run against a live site.

To test the Instagram feed without a real account, run the stand-in API and point the dev server at it:

```
npm run mock-instagram
INSTAGRAM_API_BASE=http://localhost:9911 ADMIN_PASSWORD=pick-a-test-password netlify dev
ADMIN_PASSWORD=pick-a-test-password IG_TEST_TOKEN=mock-test-token-0123456789 npm test
```

In the panel, connect with any token that starts with `mock-`. The stand-in's sample images won't show through the local image service; the posts, settings and fallbacks all work. Never set `INSTAGRAM_API_BASE` on the live site.

If `netlify dev` fails while setting up Edge Functions, add `--internal-disable-edge-functions` (this project has none).

## Backups and data

- Settings, Backup: download a backup file monthly. It holds settings, menu, clients and every appointment, including consent records. Photos, the Instagram connection and posts are not in it, so keep her original photos.
- Deleting the Netlify project deletes its data. Download a backup first.
- Restore replaces everything with a backup file's contents. Don't restore while clients might be booking.

## What it does not do yet

- Online payments or deposits. The payment note covers it for now. Square or Stripe payment links are the simple next step.
- Automatic text messages. Texts open Ionee's Messages app with the words filled in, and she taps send. Automatic SMS needs a paid service like Twilio and its own consent rules.
- Playing reels on the site. Reels show their cover image and open on Instagram.
- Multiple staff calendars. It's built for one person.
