-- Studio Contenu : schéma Supabase. À exécuter dans l'éditeur SQL de chaque projet (test et réel). Peut être réexécuté sans risque.

create table if not exists public.documents (
  collection text not null,
  id text not null,
  data jsonb not null,
  maj_le timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists documents_date_heure on public.documents (collection, (data->>'date_heure'));
create index if not exists documents_date_publication on public.documents (collection, (data->>'date_publication'));

alter table public.documents enable row level security;
drop policy if exists "documents : membres connectés" on public.documents;
create policy "documents : membres connectés" on public.documents
  for all to authenticated using (true) with check (true);

revoke all on table public.documents from anon, authenticated, public;
grant select, insert, update, delete on table public.documents to authenticated;
grant all on table public.documents to service_role;

do $$ begin
  alter publication supabase_realtime add table public.documents;
exception when duplicate_object then null; end $$;

-- Stockage privé des visuels (20 Mo au plus par fichier).
insert into storage.buckets (id, name, public, file_size_limit)
values ('visuels', 'visuels', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "visuels : membres connectés" on storage.objects;
create policy "visuels : membres connectés" on storage.objects
  for all to authenticated using (bucket_id = 'visuels') with check (bucket_id = 'visuels');

-- Écritures de la veille, en une seule transaction. Réservée à la clé de service.
-- Opération 'verifier' : le bulletin de la semaine doit encore être dans l'état lu au départ (genere_le égal à valeur, ou document absent si valeur est null),
-- sinon l'exception veille_conflit annule tout le lot. Un verrou de transaction sérialise deux veilles simultanées, même si le document n'existe pas encore.
create or replace function public.appliquer_veille(ecritures jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e jsonb;
begin
  for e in select * from jsonb_array_elements(ecritures) loop
    if e->>'op' = 'delete' then
      delete from public.documents
      where collection = e->>'collection' and id = e->>'doc_id'
        and (e->>'si_maj_le' is null or data->>'maj_le' = e->>'si_maj_le');
    elsif e->>'op' = 'verifier' then
      if e->>'champ' is distinct from 'genere_le' then
        raise exception 'Champ de vérification inconnu : %', e->>'champ';
      end if;
      perform pg_advisory_xact_lock(hashtext('veille:' || (e->>'collection') || '/' || (e->>'doc_id')));
      if e->>'valeur' is null then
        if exists (select 1 from public.documents where collection = e->>'collection' and id = e->>'doc_id') then
          raise exception 'veille_conflit';
        end if;
      elsif not exists (
        select 1 from public.documents
        where collection = e->>'collection' and id = e->>'doc_id' and data->>'genere_le' = e->>'valeur'
      ) then
        raise exception 'veille_conflit';
      end if;
    elsif e->>'op' = 'set' then
      insert into public.documents (collection, id, data, maj_le)
      values (e->>'collection', e->>'doc_id', e->'data', now())
      on conflict (collection, id) do update set data = excluded.data, maj_le = now();
    else
      raise exception 'Opération inconnue : %', e->>'op';
    end if;
  end loop;
end $$;
revoke all on function public.appliquer_veille(jsonb) from public, anon, authenticated;
grant execute on function public.appliquer_veille(jsonb) to service_role;
