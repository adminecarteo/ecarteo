import { useLocale } from './locale-context';
import styles from '@/components/publisher-information.module.css';

/** Localized locally so marketing navigation never needs a server-component refresh. */
export function StaticPublisher() {
  const { copy } = useLocale();
  return (
    <div className={styles.information}>
      <span>Intertrad · Paris, France</span>
      <a href="/mentions-legales">{copy('Mentions légales', 'Legal notice')}</a>
      <a href="/confidentialite" rel="noreferrer">
        {copy('Confidentialité', 'Privacy')}
      </a>
      <a href="/conditions" rel="noreferrer">
        {copy('Conditions d’utilisation', 'Terms of use')}
      </a>
    </div>
  );
}
