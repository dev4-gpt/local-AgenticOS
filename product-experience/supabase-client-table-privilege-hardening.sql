-- Apply after the client schema. RLS does not guard table-wide administration.
-- This changes ACLs only; tenant rows, policies, function grants and clocks stay
-- unchanged. Future defaults cover the applying creator, not other owners.
begin;

alter default privileges
  revoke truncate, references, trigger, maintain on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger, maintain on tables from public, anon, authenticated;

do $$
declare target record;
begin
  for target in
    select n.nspname, c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and (pg_catalog.left(c.relname,7)='client_' or c.relname='deployment_requests')
      and c.relkind in ('r','p')
    order by c.relname
  loop
    execute format(
      'revoke truncate, references, trigger, maintain on table %I.%I from public, anon, authenticated',
      target.nspname, target.relname
    );
  end loop;

  -- Inherited or owner privileges cannot be repaired by a direct ACL revoke.
  -- Abort atomically instead of changing role membership or claiming success.
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'),('authenticated')) r(role_name)
    cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
    where n.nspname='public'
      and (pg_catalog.left(c.relname,7)='client_' or c.relname='deployment_requests')
      and c.relkind in ('r','p')
      and pg_catalog.has_table_privilege(r.role_name,c.oid,p.privilege)
  ) then
    raise exception 'client_administrative_table_privilege_remains';
  end if;
end;
$$;

commit;
