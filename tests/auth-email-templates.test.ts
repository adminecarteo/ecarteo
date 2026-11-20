import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('authentication email link contract', () => {
  it.each([
    ['confirmation', 'signup'],
    ['recovery', 'recovery'],
  ])('%s preserves the single-use app link in both languages and the fallback', (name, type) => {
    const html = readFileSync(
      new URL(`../supabase/templates/${name}.html`, import.meta.url),
      'utf8',
    );
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const actionLinks = links.filter((href) => href.includes('/auth/confirm'));
    expect(actionLinks).toHaveLength(3);
    for (const href of actionLinks) {
      expect(href).toBe(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`);
      const rendered = href
        .replace('{{ .SiteURL }}', 'https://workspace.example.test')
        .replace('{{ .TokenHash }}', 'synthetic-single-use-token')
        .replaceAll('&amp;', '&');
      const url = new URL(rendered);
      expect(url.origin).toBe('https://workspace.example.test');
      expect(url.pathname).toBe('/auth/confirm');
      expect([...url.searchParams.entries()]).toEqual([
        ['token_hash', 'synthetic-single-use-token'],
        ['type', type],
      ]);
    }
    expect(html).toContain('lang="en"');
    expect(html).toContain('mailto:admin-dev@ecarteo.fr');
    expect(html).not.toMatch(/<\s*(script|iframe|form|input|svg)\b|url\(|<link\b|\bsrc=/i);
    expect(
      links.every(
        (href) => href.startsWith('{{ .SiteURL }}') || href === 'mailto:admin-dev@ecarteo.fr',
      ),
    ).toBe(true);
  });
});
