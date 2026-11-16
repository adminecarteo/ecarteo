import { getRequestLocale } from '@/server/locale';
import styles from './publisher-information.module.css';

function approvedUrl(value: string | undefined) {
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
}

export async function PublisherInformation() {
  const french = (await getRequestLocale()) === 'fr';
  const privacy = approvedUrl(process.env.ECARTEO_PRIVACY_URL);
  const terms = approvedUrl(process.env.ECARTEO_TERMS_URL);
  return (
    <div className={styles.information}>
      <span>Intertrad · Paris, France</span>
      {privacy && (
        <a href={privacy} rel="noreferrer">
          {french ? 'Confidentialité' : 'Privacy'}
        </a>
      )}
      {terms && (
        <a href={terms} rel="noreferrer">
          {french ? 'Conditions d’utilisation' : 'Terms of use'}
        </a>
      )}
    </div>
  );
}
