const fs = require('fs');
const { Client } = require('pg');

const envText = fs.readFileSync('.env', 'utf8');
const envLine = envText.split(/\r?\n/).find((line) => line.startsWith('LIVE_DATABASE_URL='));
if (!envLine) {
  throw new Error('LIVE_DATABASE_URL not found in .env');
}
let dbUrl = envLine.slice('LIVE_DATABASE_URL='.length).trim();
if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) {
  dbUrl = dbUrl.slice(1, -1);
}

(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const countsSql = 'select ' +
    '(select count(*) from public."Member" m left join public."Users" u on u."userId" = m."profileId" where u."userId" is null) as member_profileids_not_users, ' +
    '(select count(*) from public."Member" m inner join public."Member" m2 on m2."id" = m."profileId") as member_profileids_that_are_member_ids, ' +
    '(select count(*) from public."FriendRequest" fr left join public."Users" u on u."userId" = fr."requesterProfileId" where u."userId" is null) as friend_requester_not_users, ' +
    '(select count(*) from public."FriendRequest" fr left join public."Users" u on u."userId" = fr."recipientProfileId" where u."userId" is null) as friend_recipient_not_users, ' +
    '(select count(*) from public."FriendRequest" fr inner join public."Member" m on m."id" = fr."requesterProfileId") as friend_requester_member_ids, ' +
    '(select count(*) from public."FriendRequest" fr inner join public."Member" m on m."id" = fr."recipientProfileId") as friend_recipient_member_ids';

  const result = await client.query(countsSql);
  console.log(JSON.stringify(result.rows, null, 2));

  const sampleSql = 'select m."id", m."profileId", m."serverId", parent."profileId" as "parentProfileId" ' +
    'from public."Member" m ' +
    'left join public."Users" u on u."userId" = m."profileId" ' +
    'left join public."Member" parent on parent."id" = m."profileId" ' +
    'where u."userId" is null ' +
    'order by m."createdAt" asc limit 20';

  const samples = await client.query(sampleSql);
  console.log('SAMPLES');
  console.log(JSON.stringify(samples.rows, null, 2));

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
