// Runs every day:
//   1. clears out old rate-limit records (hashed IP addresses) older than a day
//   2. counts client records past the retention period, for the panel's Today screen,
//      and on the 1st of the month erases them (Settings, Privacy turns this off)
//   3. if email is set up, emails each client with a confirmed appointment tomorrow
//      a reminder, and emails Ionee tomorrow's schedule
// Netlify cron times are UTC. 13:00 UTC is 9 AM Eastern in summer, 8 AM in winter.
import { getAuth, manageToken, sweepThrottles } from '../lib/auth.mjs';
import { getSettings, mutateMonth, readMonth } from '../lib/store.mjs';
import { addDays, formatDateLong, monthKey, nowIn } from '../lib/time.mjs';
import { clientReminderEmail, mailEnabled, ownerDigestEmail, ownerEmail, sendMail } from '../lib/mail.mjs';
import { eraseOld, findOldRecords, saveCheck } from '../lib/privacy.mjs';

export const config = { schedule: '0 13 * * *' };

export default async () => {
  const settings = await getSettings();

  try {
    const swept = await sweepThrottles(24);
    console.log(`Rate-limit records cleared: ${swept}.`);
  } catch (err) {
    console.error('Rate-limit sweep failed', err);
  }

  // On the 1st of each month, records past the retention period set in Settings are
  // erased, as the privacy policy says. Other days just count them for the panel.
  try {
    const firstOfMonth = nowIn(settings.business.timezone).date.endsWith('-01');
    if (firstOfMonth && Number(settings.privacy.retentionYears) > 0) {
      const erased = await eraseOld(settings, { auto: true });
      console.log(`Monthly clean-up: erased ${erased.clients} clients and ${erased.appointments} appointments.`);
    } else {
      const found = await findOldRecords(settings);
      await saveCheck(found);
      console.log(`Records past retention: ${found.clients.length} clients, ${found.loose.length} other appointments.`);
    }
  } catch (err) {
    console.error('Retention check failed', err);
  }

  if (!mailEnabled()) {
    console.log('Daily reminders skipped: email is not set up.');
    return;
  }
  const origin = (process.env.URL || '').replace(/\/$/, '');
  const auth = await getAuth();
  const tomorrow = addDays(nowIn(settings.business.timezone).date, 1);
  const ym = monthKey(tomorrow);
  const appts = (await readMonth(ym))
    .filter((a) => a.date === tomorrow && ['pending', 'confirmed'].includes(a.status))
    .sort((a, b) => a.start.localeCompare(b.start));

  const owner = ownerEmail(settings);
  if (owner && appts.length) {
    await sendMail({ to: owner, ...ownerDigestEmail(formatDateLong(tomorrow), appts, settings, `${origin}/admin/`) });
  }

  const reminded = [];
  for (const a of appts) {
    if (a.status !== 'confirmed' || !a.email || a.reminderSentFor === a.date) continue;
    const manage = `${origin}/appointment/?id=${a.id}&m=${ym}&t=${manageToken(a.id, auth)}`;
    const result = await sendMail({ to: a.email, ...clientReminderEmail(a, settings, manage), replyTo: owner || undefined });
    if (result.ok) reminded.push(a.id);
  }

  if (reminded.length) {
    const now = new Date().toISOString();
    await mutateMonth(ym, (items) => {
      for (const a of items) {
        if (reminded.includes(a.id)) {
          a.reminderSentFor = a.date;
          a.log = [...(a.log || []), { at: now, text: 'Reminder email sent' }];
        }
      }
    });
  }
  console.log(`Daily reminders: ${appts.length} tomorrow, ${reminded.length} reminders sent.`);
};
