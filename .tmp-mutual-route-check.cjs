const fs = require('fs');
const { Client } = require('pg');

const envText = fs.readFileSync('.env', 'utf8');
const envLine = envText.split(/\r?\n/).find((line) => line.startsWith('LIVE_DATABASE_URL='));
if (!envLine) throw new Error('LIVE_DATABASE_URL not found in .env');
let dbUrl = envLine.slice('LIVE_DATABASE_URL='.length).trim();
if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.slice(1, -1);

const viewerProfileId = process.argv[2] || '00000001';
const targetProfileId = process.argv[3] || '00000002';

(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const mutualServersResult = await client.query(`
    with normalized_members as (
      select
        m."id" as "memberId",
        m."serverId" as "serverId",
        m."createdAt" as "createdAt",
        coalesce(parent_member."profileId", m."profileId") as "normalizedProfileId"
      from public."Member" m
      left join public."Member" parent_member
        on parent_member."id" = m."profileId"
    )
    select count(distinct self_member."serverId")::int as "count"
    from normalized_members self_member
    inner join normalized_members other_member
      on other_member."serverId" = self_member."serverId"
    where self_member."normalizedProfileId" = $1
      and other_member."normalizedProfileId" = $2
  `, [viewerProfileId, targetProfileId]);

  const mutualServersListResult = await client.query(`
    with normalized_members as (
      select
        m."id" as "memberId",
        m."serverId" as "serverId",
        m."createdAt" as "createdAt",
        coalesce(parent_member."profileId", m."profileId") as "normalizedProfileId"
      from public."Member" m
      left join public."Member" parent_member
        on parent_member."id" = m."profileId"
    )
    select distinct s."id", s."name"
    from normalized_members self_member
    inner join normalized_members other_member
      on other_member."serverId" = self_member."serverId"
    inner join public."Server" s
      on s."id" = self_member."serverId"
    where self_member."normalizedProfileId" = $1
      and other_member."normalizedProfileId" = $2
    order by s."name" asc
  `, [viewerProfileId, targetProfileId]);

  const mutualFriendsResult = await client.query(`
    with normalized_friend_requests as (
      select
        upper(trim(coalesce(fr."status", ''))) as "status",
        coalesce(reqm_parent."profileId", reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
        coalesce(recm_parent."profileId", recm."profileId", fr."recipientProfileId") as "recipientProfileId"
      from public."FriendRequest" fr
      left join public."Member" reqm on reqm."id" = fr."requesterProfileId"
      left join public."Member" reqm_parent on reqm_parent."id" = reqm."profileId"
      left join public."Member" recm on recm."id" = fr."recipientProfileId"
      left join public."Member" recm_parent on recm_parent."id" = recm."profileId"
    ),
    friend_edges as (
      select
        nfr."requesterProfileId" as "aProfileId",
        nfr."recipientProfileId" as "bProfileId"
      from normalized_friend_requests nfr
      where nfr."status" = 'ACCEPTED'
    ),
    self_friends as (
      select fe."bProfileId" as "friendProfileId"
      from friend_edges fe
      where fe."aProfileId" = $1
      union
      select fe."aProfileId" as "friendProfileId"
      from friend_edges fe
      where fe."bProfileId" = $1
    ),
    target_friends as (
      select fe."bProfileId" as "friendProfileId"
      from friend_edges fe
      where fe."aProfileId" = $2
      union
      select fe."aProfileId" as "friendProfileId"
      from friend_edges fe
      where fe."bProfileId" = $2
    )
    select count(distinct sf."friendProfileId")::int as "count"
    from self_friends sf
    inner join target_friends tf
      on tf."friendProfileId" = sf."friendProfileId"
    where sf."friendProfileId" not in ($1, $2)
  `, [viewerProfileId, targetProfileId]);

  const mutualFriendsListResult = await client.query(`
    with normalized_friend_requests as (
      select
        upper(trim(coalesce(fr."status", ''))) as "status",
        coalesce(reqm_parent."profileId", reqm."profileId", fr."requesterProfileId") as "requesterProfileId",
        coalesce(recm_parent."profileId", recm."profileId", fr."recipientProfileId") as "recipientProfileId"
      from public."FriendRequest" fr
      left join public."Member" reqm on reqm."id" = fr."requesterProfileId"
      left join public."Member" reqm_parent on reqm_parent."id" = reqm."profileId"
      left join public."Member" recm on recm."id" = fr."recipientProfileId"
      left join public."Member" recm_parent on recm_parent."id" = recm."profileId"
    ),
    friend_edges as (
      select nfr."requesterProfileId" as "aProfileId", nfr."recipientProfileId" as "bProfileId"
      from normalized_friend_requests nfr
      where nfr."status" = 'ACCEPTED'
    ),
    self_friends as (
      select fe."bProfileId" as "friendProfileId" from friend_edges fe where fe."aProfileId" = $1
      union
      select fe."aProfileId" as "friendProfileId" from friend_edges fe where fe."bProfileId" = $1
    ),
    target_friends as (
      select fe."bProfileId" as "friendProfileId" from friend_edges fe where fe."aProfileId" = $2
      union
      select fe."aProfileId" as "friendProfileId" from friend_edges fe where fe."bProfileId" = $2
    )
    select distinct sf."friendProfileId"
    from self_friends sf
    inner join target_friends tf on tf."friendProfileId" = sf."friendProfileId"
    where sf."friendProfileId" not in ($1, $2)
    order by sf."friendProfileId"
  `, [viewerProfileId, targetProfileId]);

  console.log(JSON.stringify({
    viewerProfileId,
    targetProfileId,
    mutualServersCount: mutualServersResult.rows[0]?.count ?? null,
    mutualServersListLength: mutualServersListResult.rows.length,
    mutualServersList: mutualServersListResult.rows,
    mutualFriendsCount: mutualFriendsResult.rows[0]?.count ?? null,
    mutualFriendsListLength: mutualFriendsListResult.rows.length,
    mutualFriendsList: mutualFriendsListResult.rows,
  }, null, 2));

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
