'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConsole } from '@/lib/console-context';
import { Button, Card, Field } from './ui';

export function WorkspaceNavigation() {
  const { workspacePage: page, locale, busy } = useConsole();
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(params.get('q') ?? '');
  if (!page) return null;
  const href = (cursor?: string | null) => {
    const query = new URLSearchParams(params.toString());
    query.delete('id');
    if (cursor) query.set('cursor', cursor);
    else query.delete('cursor');
    return `/app?${query}`;
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams(params.toString());
    query.delete('cursor');
    query.delete('id');
    if (search.trim()) query.set('q', search.trim());
    else query.delete('q');
    router.push(`/app?${query}`);
  }
  return (
    <Card className="workspace-pagination">
      <form onSubmit={submit} className="workspace-search">
        <Field label={locale === 'fr' ? 'Rechercher dans tout l’historique' : 'Search all history'}>
          <input
            type="search"
            maxLength={120}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === 'fr' ? 'Parcours ou client' : 'Journey or client'}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {locale === 'fr' ? 'Rechercher' : 'Search'}
        </Button>
      </form>
      <p className="muted">
        {locale === 'fr'
          ? `${page.count} parcours et missions sur cette page, avec leurs preuves et actions. Les indicateurs couvrent tout le client sélectionné.`
          : `${page.count} journeys and missions on this page, with their evidence and actions. Metrics cover the entire selected client scope.`}
      </p>
      <nav
        aria-label={locale === 'fr' ? 'Historique de l’espace' : 'Workspace history'}
        className="workspace-pages"
      >
        {page.hasPrevious && (
          <Link className="btn" href={href()}>
            {locale === 'fr' ? 'Revenir aux plus récents' : 'Back to newest'}
          </Link>
        )}
        {page.nextCursor && (
          <Link className="btn" href={href(page.nextCursor)}>
            {locale === 'fr' ? 'Historique suivant' : 'Next history page'}
          </Link>
        )}
      </nav>
    </Card>
  );
}
