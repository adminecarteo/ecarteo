'use client';
import { useLocale } from '@/lib/locale-context';
import { LanguageSwitcher } from '@/components/language-switcher';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { copy } = useLocale();
  return (
    <main className="boot">
      <LanguageSwitcher />
      <h1>{copy('La console n’a pas pu s’afficher', 'The workspace could not be displayed')}</h1>
      <p>
        {copy(
          'Vos données enregistrées sont conservées. Réessayez de charger la page.',
          'Your saved data is safe. Try loading the page again.',
        )}
      </p>
      <button className="btn primary" onClick={reset}>
        {copy('Réessayer', 'Try again')}
      </button>
    </main>
  );
}
