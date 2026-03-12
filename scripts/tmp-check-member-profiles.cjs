const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const url = (process.env.LIVE_DATABASE_URL || process.env.DATABASE_URL || '').trim();
  if (!url) {
    console.error('NO_DB_URL');
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const q1 = await client.query('select count(*)::int as c from "Member"');
    const q2 = await client.query('select "profileId", count(*)::int as c from "Member" group by "profileId" order by c desc limit 50');
    const q3 = await client.query('select distinct "profileId" from "Member" where "profileId" like $1 limit 100', ['botcfg%']);
    const q4 = await client.query('select distinct "profileId" from "Member" where lower("profileId") like $1 limit 100', ['%bot%']);

    console.log('member_count', q1.rows[0]?.c ?? 0);
    console.log('top_profile_ids');
    console.log(JSON.stringify(q2.rows, null, 2));
    console.log('botcfg_profile_ids');
    console.log(JSON.stringify(q3.rows, null, 2));
    console.log('contains_bot_profile_ids');
    console.log(JSON.stringify(q4.rows, null, 2));
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
