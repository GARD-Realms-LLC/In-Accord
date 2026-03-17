const fs = require('fs');
const { Client } = require('pg');

const envText = fs.readFileSync('.env', 'utf8');
const envLine = envText.split(/\r?\n/).find((line) => line.startsWith('LIVE_DATABASE_URL='));
if (!envLine) throw new Error('LIVE_DATABASE_URL not found in .env');
let dbUrl = envLine.slice('LIVE_DATABASE_URL='.length).trim();
if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.slice(1, -1);

(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const sharedServers = await client.query(`
    with pairs as (
      select
        m1."profileId" as "viewerProfileId",
        m2."profileId" as "targetProfileId",
        count(distinct m1."serverId")::int as "sharedServerCount"
      from public."Member" m1
      inner join public."Member" m2
        on m2."serverId" = m1."serverId"
       and m2."profileId" <> m1."profileId"
      group by m1."profileId", m2."profileId"
    )
    select
      p."viewerProfileId",
      vu."name" as "viewerName",
      p."targetProfileId",
      tu."name" as "targetName",
      p."sharedServerCount"
    from pairs p
    left join public."Users" vu on vu."userId" = p."viewerProfileId"
    left join public."Users" tu on tu."userId" = p."targetProfileId"
    order by p."sharedServerCount" desc, p."viewerProfileId", p."targetProfileId"
    limit 20
  `);

  const sharedFriends = await client.query(`
    with normalized_friend_requests as (
      select
        upper(trim(coalesce(fr."status", ''))) as "status",
        fr."requesterProfileId" as "requesterProfileId",
        fr."recipientProfileId" as "recipientProfileId"
      from public."FriendRequest" fr
    ),
    friend_edges as (
      select
        nfr."requesterProfileId" as "aProfileId",
        nfr."recipientProfileId" as "bProfileId"
      from normalized_friend_requests nfr
      where nfr."status" = 'ACCEPTED'
    ),
    friends_flat as (
      select fe."aProfileId" as "ownerProfileId", fe."bProfileId" as "friendProfileId" from friend_edges fe
      union all
      select fe."bProfileId" as "ownerProfileId", fe."aProfileId" as "friendProfileId" from friend_edges fe
    ),
    pair_counts as (
      select
        f1."ownerProfileId" as "viewerProfileId",
        f2."ownerProfileId" as "targetProfileId",
        count(distinct f1."friendProfileId")::int as "sharedFriendCount"
      from friends_flat f1
      inner join friends_flat f2
        on f2."friendProfileId" = f1."friendProfileId"
       and f2."ownerProfileId" <> f1."ownerProfileId"
      where f1."friendProfileId" not in (f1."ownerProfileId", f2."ownerProfileId")
      group by f1."ownerProfileId", f2."ownerProfileId"
    )
    select
      p."viewerProfileId",
      vu."name" as "viewerName",
      p."targetProfileId",
      tu."name" as "targetName",
      p."sharedFriendCount"
    from pair_counts p
    left join public."Users" vu on vu."userId" = p."viewerProfileId"
    left join public."Users" tu on tu."userId" = p."targetProfileId"
    order by p."sharedFriendCount" desc, p."viewerProfileId", p."targetProfileId"
    limit 20
  `);

  console.log('SHARED_SERVERS');
  console.log(JSON.stringify(sharedServers.rows, null, 2));
  console.log('SHARED_FRIENDS');
  console.log(JSON.stringify(sharedFriends.rows, null, 2));

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
