-- Studio Contenu : schéma Supabase. À exécuter une fois dans l'éditeur SQL de chaque projet (test et réel).

create table if not exists documents (
  collection text not null,
  id text not null,
  data jsonb not null,
  maj_le timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists documents_date_heure on documents (collection, (data->>'date_heure'));
create index if not exists documents_date_publication on documents (collection, (data->>'date_publication'));

alter table documents enable row level security;
drop policy if exists "documents : membres connectés" on documents;
create policy "documents : membres connectés" on documents
  for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table documents;
exception when duplicate_object then null; end $$;

-- Stockage privé des visuels (20 Mo au plus par fichier).
insert into storage.buckets (id, name, public, file_size_limit)
values ('visuels', 'visuels', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "visuels : membres connectés" on storage.objects;
create policy "visuels : membres connectés" on storage.objects
  for all to authenticated using (bucket_id = 'visuels') with check (bucket_id = 'visuels');

-- Écritures de la veille, en une seule transaction. Réservée à la clé de service.
create or replace function appliquer_veille(ecritures jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  for e in select * from jsonb_array_elements(ecritures) loop
    if e->>'op' = 'delete' then
      delete from documents
      where collection = e->>'collection' and id = e->>'doc_id'
        and (e->>'si_maj_le' is null or data->>'maj_le' = e->>'si_maj_le');
    elsif e->>'op' = 'set' then
      insert into documents (collection, id, data, maj_le)
      values (e->>'collection', e->>'doc_id', e->'data', now())
      on conflict (collection, id) do update set data = excluded.data, maj_le = now();
    else
      raise exception 'Opération inconnue : %', e->>'op';
    end if;
  end loop;
end $$;
revoke all on function appliquer_veille(jsonb) from public, anon, authenticated;
grant execute on function appliquer_veille(jsonb) to service_role;
