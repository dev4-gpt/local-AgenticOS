-- Apply after v42. ECC learning is tenant-owned data, never an authorization
-- source. Only the fixed RPCs can mutate it through an authenticated client.
begin;

create or replace function public.client_ecc_role(p_tenant_slug text)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.client_memberships m join public.client_tenants t on t.slug=m.tenant_slug
  where m.tenant_slug=p_tenant_slug and m.user_id=auth.uid() and m.status='active' and t.status='active';
$$;

create or replace function public.ecc_content_valid(c jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare v text;
begin
  if c is null or jsonb_typeof(c)<>'object' or octet_length(c::text)>16000
    or not c ?& array['summary','trigger','action','evidenceReferences','sourceHashes']
    or exists(select 1 from jsonb_object_keys(c) k where k not in ('summary','trigger','action','evidenceReferences','sourceHashes')) then return false; end if;
  foreach v in array array['summary','trigger','action'] loop
    if jsonb_typeof(c->v)<>'string' or length(btrim(c->>v)) not between 1 and 2000 then return false; end if;
  end loop;
  if jsonb_typeof(c->'evidenceReferences')<>'array' or jsonb_typeof(c->'sourceHashes')<>'array' then return false; end if;
  if jsonb_array_length(c->'evidenceReferences') not between 1 and 20 or jsonb_array_length(c->'sourceHashes') not between 1 and 20 then return false; end if;
  if exists(select 1 from jsonb_array_elements(c->'evidenceReferences') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[a-zA-Z0-9][a-zA-Z0-9:._/#-]{0,199}$')
    or exists(select 1 from jsonb_array_elements(c->'sourceHashes') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[0-9a-f]{64}$') then return false; end if;
  v := (c->>'summary') || E'\n' || (c->>'trigger') || E'\n' || (c->>'action') || E'\n' || c::text;
  return v !~* '(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token|authorization|cookie)[[:space:]]*[:=][[:space:]]*[^[:space:]]{4,}|(sk|rk|xai)-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{25,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.|-----BEGIN [A-Z ]*PRIVATE KEY-----';
end;
$$;

create or replace function public.ecc_content_risky(c jsonb)
returns boolean language sql immutable set search_path = public as $$
  select c::text ~* 'ignore (all |the |previous |prior )*(instructions|rules)|(system|developer)[[:space:]]*(prompt|message)[[:space:]]*:|(disable|bypass|override)[[:space:]]+(authorization|permissions|approval|budget|safety)|exfiltrate|reveal credentials';
$$;

create table public.client_ecc_policy (
  tenant_slug text primary key references public.client_tenants(slug) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists client_runtime_jobs_tenant_id_ecc on public.client_runtime_jobs(tenant_slug,id);
create unique index if not exists client_runtime_records_tenant_id_ecc on public.client_runtime_records(tenant_slug,id);

create table public.client_learning_items (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null,
  idempotency_key text not null check(length(idempotency_key) between 8 and 180),
  source_job_id uuid,
  source_record_id uuid,
  content jsonb not null check(public.ecc_content_valid(content)),
  content_hash text not null check(content_hash=encode(extensions.digest(content::text,'sha256'),'hex')),
  confidence numeric not null default 0 check(confidence between 0 and 1),
  revision integer not null default 1 check(revision>0),
  status text not null default 'proposed' check(status in ('proposed','approved','rejected','revoked')),
  approved_hash text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status<>'approved' or (approved_hash is not null and approved_hash=content_hash and reviewed_by is not null and reviewed_at is not null and revoked_at is null)),
  check(num_nonnulls(source_job_id,source_record_id)<=1),
  unique(tenant_slug,id), unique(tenant_slug,created_by,idempotency_key),
  foreign key(tenant_slug,source_job_id) references public.client_runtime_jobs(tenant_slug,id) on delete cascade,
  foreign key(tenant_slug,source_record_id) references public.client_runtime_records(tenant_slug,id) on delete cascade
);
create table public.client_ecc_skill_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null,
  item_id uuid not null,
  revision integer not null,
  content jsonb not null check(public.ecc_content_valid(content)),
  content_hash text not null check(content_hash=encode(extensions.digest(content::text,'sha256'),'hex')),
  approved_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(tenant_slug,item_id,revision),
  foreign key(tenant_slug,item_id) references public.client_learning_items(tenant_slug,id) on delete cascade
);
create index client_learning_retention on public.client_learning_items(tenant_slug,retention_expires_at);

alter table public.client_ecc_policy enable row level security;
alter table public.client_learning_items enable row level security;
alter table public.client_ecc_skill_revisions enable row level security;
create policy ecc_policy_read on public.client_ecc_policy for select to authenticated using (public.client_ecc_role(tenant_slug) is not null);
create policy ecc_learning_read on public.client_learning_items for select to authenticated using (public.client_ecc_role(tenant_slug) is not null);
create policy ecc_revision_read on public.client_ecc_skill_revisions for select to authenticated using (public.client_ecc_role(tenant_slug) is not null);
revoke all on public.client_ecc_policy,public.client_learning_items,public.client_ecc_skill_revisions from public,anon,authenticated;
grant select on public.client_ecc_policy,public.client_learning_items,public.client_ecc_skill_revisions to authenticated;
grant all on public.client_ecc_policy,public.client_learning_items,public.client_ecc_skill_revisions to service_role;

create or replace function public.ecc_revision_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new)-'revoked_at')<>(to_jsonb(old)-'revoked_at')
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then raise exception 'ecc_revision_immutable'; end if;
  return new;
end;
$$;
create trigger ecc_revision_immutable before update on public.client_ecc_skill_revisions for each row execute function public.ecc_revision_immutable();

create or replace function public.set_client_ecc_enabled(p_tenant_slug text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.client_ecc_role(p_tenant_slug),'') not in ('owner','admin') or p_enabled is null then return false; end if;
  insert into public.client_ecc_policy(tenant_slug,enabled,updated_by) values(p_tenant_slug,p_enabled,auth.uid())
  on conflict(tenant_slug) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  return true;
end;
$$;

create or replace function public.propose_client_learning(p_tenant_slug text,p_key text,p_content jsonb,p_confidence numeric default 0,p_source_job_id uuid default null,p_source_record_id uuid default null)
returns uuid language plpgsql security definer set search_path = public,extensions as $$
declare item public.client_learning_items; h text; expiry timestamptz;
begin
  if coalesce(public.client_ecc_role(p_tenant_slug),'') not in ('owner','admin','member') then raise exception 'ecc_forbidden'; end if;
  if not public.ecc_content_valid(p_content) or p_confidence is null or p_confidence not between 0 and 1 or length(coalesce(p_key,'')) not between 8 and 180 then raise exception 'ecc_input_invalid'; end if;
  h:=encode(extensions.digest(p_content::text,'sha256'),'hex');
  select now()+make_interval(days=>retention_days) into expiry from public.client_tenants where slug=p_tenant_slug;
  insert into public.client_learning_items(tenant_slug,created_by,idempotency_key,content,content_hash,confidence,source_job_id,source_record_id,retention_expires_at)
  values(p_tenant_slug,auth.uid(),p_key,p_content,h,p_confidence,p_source_job_id,p_source_record_id,expiry)
  on conflict(tenant_slug,created_by,idempotency_key) do nothing;
  select * into item from public.client_learning_items where tenant_slug=p_tenant_slug and created_by=auth.uid() and idempotency_key=p_key for update;
  if item.content_hash<>h or item.source_job_id is distinct from p_source_job_id or item.source_record_id is distinct from p_source_record_id then raise exception 'ecc_idempotency_conflict'; end if;
  return item.id;
end;
$$;

create or replace function public.edit_client_learning(p_tenant_slug text,p_item_id uuid,p_expected_hash text,p_content jsonb)
returns boolean language plpgsql security definer set search_path = public,extensions as $$
declare item public.client_learning_items; actor_role text;
begin
  actor_role:=public.client_ecc_role(p_tenant_slug);
  if coalesce(actor_role,'') not in ('owner','admin','member') or not public.ecc_content_valid(p_content) then return false; end if;
  select * into item from public.client_learning_items where tenant_slug=p_tenant_slug and id=p_item_id for update;
  if not found or (actor_role='member' and item.created_by<>auth.uid()) or item.content_hash is distinct from p_expected_hash or item.retention_expires_at<=now() then return false; end if;
  update public.client_ecc_skill_revisions set revoked_at=now() where tenant_slug=p_tenant_slug and item_id=p_item_id and revoked_at is null;
  update public.client_learning_items set content=p_content,content_hash=encode(extensions.digest(p_content::text,'sha256'),'hex'),revision=revision+1,status='proposed',approved_hash=null,reviewed_by=null,reviewed_at=null,revoked_at=null,updated_at=now()
    where tenant_slug=p_tenant_slug and id=p_item_id;
  return true;
end;
$$;

create or replace function public.review_client_learning(p_tenant_slug text,p_item_id uuid,p_expected_hash text,p_decision text)
returns boolean language plpgsql security definer set search_path = public as $$
declare item public.client_learning_items;
begin
  if coalesce(public.client_ecc_role(p_tenant_slug),'') not in ('owner','admin') or coalesce(p_decision,'') not in ('approve','reject') then return false; end if;
  select * into item from public.client_learning_items where tenant_slug=p_tenant_slug and id=p_item_id for update;
  if not found or item.content_hash is distinct from p_expected_hash or item.status<>'proposed' or item.retention_expires_at<=now() then return false; end if;
  if p_decision='approve' and public.ecc_content_risky(item.content) then return false; end if;
  update public.client_learning_items set status=case when p_decision='approve' then 'approved' else 'rejected' end,
    approved_hash=case when p_decision='approve' then content_hash else null end,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where tenant_slug=p_tenant_slug and id=p_item_id;
  if p_decision='approve' then
    insert into public.client_ecc_skill_revisions(tenant_slug,item_id,revision,content,content_hash,approved_by,expires_at)
    values(p_tenant_slug,p_item_id,item.revision,item.content,item.content_hash,auth.uid(),item.retention_expires_at);
  end if;
  return true;
end;
$$;

create or replace function public.revoke_client_learning(p_tenant_slug text,p_item_id uuid,p_expected_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare item public.client_learning_items;
begin
  if coalesce(public.client_ecc_role(p_tenant_slug),'') not in ('owner','admin') then return false; end if;
  select * into item from public.client_learning_items where tenant_slug=p_tenant_slug and id=p_item_id for update;
  if not found or item.content_hash is distinct from p_expected_hash then return false; end if;
  update public.client_learning_items set status='revoked',approved_hash=null,revoked_at=coalesce(revoked_at,now()),updated_at=now() where tenant_slug=p_tenant_slug and id=p_item_id;
  update public.client_ecc_skill_revisions set revoked_at=now() where tenant_slug=p_tenant_slug and item_id=p_item_id and revoked_at is null;
  return true;
end;
$$;

create or replace function public.active_client_ecc_revisions(p_tenant_slug text)
returns setof public.client_ecc_skill_revisions language sql stable security definer set search_path = public as $$
  select r.* from public.client_ecc_skill_revisions r join public.client_learning_items i on i.tenant_slug=r.tenant_slug and i.id=r.item_id
  where r.tenant_slug=p_tenant_slug and public.client_ecc_role(p_tenant_slug) is not null
    and i.status='approved' and i.approved_hash=r.content_hash and i.content_hash=r.content_hash and i.revision=r.revision
    and r.revoked_at is null and i.revoked_at is null and r.expires_at>now() and i.retention_expires_at>now() and not public.ecc_content_risky(r.content)
  order by r.created_at desc limit 50;
$$;

-- The worker rechecks the actual job requester, active tenant and database
-- policy; a viewer cannot bypass the API by calling the older enqueue RPC.
create or replace function public.admit_client_ecc_job(p_tenant_slug text,p_job_id uuid,p_worker_token text)
returns text language sql stable security definer set search_path = public,extensions as $$
  select m.role from public.client_runtime_jobs j
  join public.client_tenants t on t.slug=j.tenant_slug
  join public.client_memberships m on m.tenant_slug=j.tenant_slug and m.user_id=j.requested_by
  join public.client_ecc_policy p on p.tenant_slug=j.tenant_slug
  where j.tenant_slug=p_tenant_slug and j.id=p_job_id and j.capability='ecc-workflows' and j.status='running'
    and t.status='active' and p.enabled and m.status='active' and m.role in ('owner','admin','member')
    and length(p_worker_token)>=24 and t.worker_token_hash=encode(extensions.digest(p_worker_token,'sha256'),'hex');
$$;

-- Collect only a fixed structured terminal outcome, never prompt/output text.
create or replace function public.capture_client_learning_outcome()
returns trigger language plpgsql security definer set search_path = public,extensions as $$
declare c jsonb; source_hash text; expiry timestamptz; capability_name text;
begin
  if new.status not in ('succeeded','failed','cancelled') or old.status=new.status or new.requested_by is null then return new; end if;
  if not exists(select 1 from public.client_ecc_policy where tenant_slug=new.tenant_slug and enabled) then return new; end if;
  capability_name:=case when new.capability ~ '^[a-z][a-z0-9-]{0,79}$' then new.capability else 'unclassified' end;
  source_hash:=encode(extensions.digest(jsonb_build_object('id',new.id,'status',new.status,'capability',capability_name)::text,'sha256'),'hex');
  c:=jsonb_build_object('summary','Job '||capability_name||' finished with status '||new.status||'. No output text was ingested.',
    'trigger','A comparable approved job is planned.','action','Inspect the linked job outcome and decide whether its verified steps should be reused.',
    'evidenceReferences',jsonb_build_array('job:'||new.id),'sourceHashes',jsonb_build_array(source_hash));
  select now()+make_interval(days=>retention_days) into expiry from public.client_tenants where slug=new.tenant_slug;
  insert into public.client_learning_items(tenant_slug,created_by,idempotency_key,source_job_id,content,content_hash,confidence,retention_expires_at)
    values(new.tenant_slug,new.requested_by,'job:'||new.id,new.id,c,encode(extensions.digest(c::text,'sha256'),'hex'),0,expiry)
    on conflict(tenant_slug,created_by,idempotency_key) do nothing;
  return new;
end;
$$;
create trigger capture_client_learning_outcome after update of status on public.client_runtime_jobs for each row execute function public.capture_client_learning_outcome();

create or replace function public.invalidate_client_learning_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_jsonb(new) is not distinct from to_jsonb(old) then return new; end if;
  update public.client_ecc_skill_revisions r set revoked_at=now() from public.client_learning_items i
    where r.tenant_slug=i.tenant_slug and r.item_id=i.id and r.revoked_at is null and i.tenant_slug=new.tenant_slug
      and ((tg_table_name='client_runtime_jobs' and i.source_job_id=new.id) or (tg_table_name='client_runtime_records' and i.source_record_id=new.id));
  update public.client_learning_items set status='revoked',approved_hash=null,revoked_at=coalesce(revoked_at,now()),updated_at=now()
    where tenant_slug=new.tenant_slug and status='approved'
      and ((tg_table_name='client_runtime_jobs' and source_job_id=new.id) or (tg_table_name='client_runtime_records' and source_record_id=new.id));
  return new;
end;
$$;
create trigger invalidate_ecc_job_source after update of status on public.client_runtime_jobs for each row when(old.status is distinct from new.status) execute function public.invalidate_client_learning_source();
create trigger invalidate_ecc_record_source after update of content on public.client_runtime_records for each row when(old.content is distinct from new.content) execute function public.invalidate_client_learning_source();

-- Lock down every newly introduced function; only the explicit worker-token
-- admission RPC is callable with the worker's anon API key.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('client_ecc_role','ecc_content_valid','ecc_content_risky','ecc_revision_immutable','set_client_ecc_enabled','propose_client_learning','edit_client_learning','review_client_learning','revoke_client_learning','active_client_ecc_revisions','admit_client_ecc_job','capture_client_learning_outcome','invalidate_client_learning_source') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
    if f.proname not in ('ecc_revision_immutable','capture_client_learning_outcome','invalidate_client_learning_source','admit_client_ecc_job') then execute format('grant execute on function %s to authenticated',f.signature); end if;
    if f.proname='admit_client_ecc_job' then execute format('grant execute on function %s to anon',f.signature); end if;
  end loop;
end $$;
commit;
