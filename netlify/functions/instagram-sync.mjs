// Every 6 hours: renew the Instagram token when it's due and pull the latest posts
// for the "Recent work" section. Does nothing until Instagram is connected in the panel.
// Netlify cron times are UTC.
import { purgeCache } from '@netlify/functions';
import { sync } from '../lib/instagram.mjs';

export const config = { schedule: '23 */6 * * *' };

export default async () => {
  const result = await sync({ force: true });
  if (result.changed) {
    try {
      await purgeCache({ tags: ['site'] });
    } catch (err) {
      console.error('Cache purge failed', err);
    }
  }
  console.log('Instagram sync:', JSON.stringify(result));
};
