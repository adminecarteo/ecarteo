'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { BillingOverview } from '@/lib/billing-types';
import { useLocale } from '@/lib/locale-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { portalRequest } from '@/lib/portal-client';
import { billingAmount } from '@/lib/billing-format';
import styles from './billing.module.css';

function billingLabels(copy: (fr: string, en: string) => string) {
  const statusLabels: Record<string, string> = {
    active: copy('Actif', 'Active'),
    trialing: copy('Période d’essai', 'Trial'),
    past_due: copy('Paiement à régulariser', 'Payment overdue'),
    unpaid: copy('Impayé', 'Unpaid'),
    canceled: copy('Résilié', 'Cancelled'),
    incomplete: copy('Paiement incomplet', 'Payment incomplete'),
    incomplete_expired: copy('Souscription expirée', 'Subscription expired'),
    paused: copy('Suspendu', 'Paused'),
  };
  const intervalLabels: Record<string, string> = {
    day: copy('jour', 'day'),
    week: copy('semaine', 'week'),
    month: copy('mois', 'month'),
    year: copy('an', 'year'),
  };
  return { statusLabels, intervalLabels };
}

export default function Billing({
  initial,
  returned = false,
}: {
  initial: BillingOverview;
  returned?: boolean;
}) {
  const { locale, copy } = useLocale();
  const { statusLabels, intervalLabels } = billingLabels(copy);
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    setPending('refresh');
    setError('');
    try {
      const payload = await portalRequest<BillingOverview>('/api/billing');
      setState(payload);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy('Impossible d’actualiser. Réessayez.', 'Unable to refresh. Please try again.'),
      );
    } finally {
      setPending('');
    }
  }
  async function action(action: 'checkout' | 'portal' | 'cancel-checkout', plan?: string) {
    setPending(plan || action);
    setError('');
    try {
      const payload = await portalRequest<{ url: string }>(
        '/api/billing',
        'POST',
        { action, ...(plan ? { plan } : {}) },
        60_000,
      );
      if (action === 'cancel-checkout') {
        await refresh();
        return;
      }
      let url: URL;
      try {
        url = new URL(payload.url);
      } catch {
        throw new Error(
          copy('Le lien de facturation est invalide.', 'The billing link is invalid.'),
        );
      }
      if (
        url.username ||
        url.password ||
        url.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)
      )
        throw new Error(
          copy('Le lien de facturation est invalide.', 'The billing link is invalid.'),
        );
      window.location.assign(url.href);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy('Connexion interrompue. Réessayez.', 'Connection interrupted. Please try again.'),
      );
    } finally {
      setPending('');
    }
  }
  const hasSubscription = state.subscriptions.some(
    (subscription) => !['canceled', 'incomplete_expired'].includes(subscription.status),
  );
  return (
    <main className={styles.page} lang={locale}>
      <Link href="/app" className={styles.back}>
        {copy('← Retour à votre espace', '← Back to your workspace')}
      </Link>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">{copy('Votre organisation', 'Your organization')}</p>
          <h1>{copy('Abonnement et factures', 'Subscription and invoices')}</h1>
          <p>
            {copy(
              'Retrouvez votre abonnement, vos moyens de paiement et vos factures.',
              'View your subscription, payment methods and invoices.',
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          <LanguageSwitcher />
          <button
            className="btn"
            onClick={() => void refresh()}
            disabled={Boolean(pending)}
            aria-busy={pending === 'refresh'}
          >
            {copy('Actualiser', 'Refresh')}
          </button>
        </div>
      </header>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {returned && (
        <p className={styles.notice} role="status">
          {copy(
            'Votre retour du paiement a été reçu. L’état ci-dessous est confirmé par le service de facturation. Actualisez s’il n’a pas encore changé.',
            'You have returned from checkout. The status below is confirmed by the billing service. Refresh if it has not changed yet.',
          )}
        </p>
      )}
      {!state.enabled ? (
        <section className={styles.panel}>
          <h2>{copy('Vos prestations sur devis', 'Your quoted services')}</h2>
          <p>
            {copy(
              'La souscription en ligne n’est pas encore ouverte. Vos audits et rapports restent accessibles depuis votre espace. Votre interlocuteur Écartéo vous accompagne pour les devis et la facturation.',
              'Online subscriptions are not available yet. Your audits and reports remain accessible from your workspace. Your Écartéo representative can help with quotes and billing.',
            )}
          </p>
        </section>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="current-billing">
            <h2 id="current-billing">{copy('Votre abonnement', 'Your subscription')}</h2>
            {state.subscriptions.length ? (
              <ul className={styles.subscriptions}>
                {state.subscriptions.map((subscription) => (
                  <li key={subscription.id}>
                    <div>
                      <strong>{subscription.plan || copy('Abonnement', 'Subscription')}</strong>
                      <span>
                        {statusLabels[subscription.status] ||
                          copy('Statut à vérifier', 'Status requires review')}
                      </span>
                    </div>
                    {subscription.periodEnd && (
                      <p>
                        {subscription.cancelAtPeriodEnd
                          ? copy('Fin prévue', 'Scheduled end')
                          : copy('Fin de période', 'Period ends')}{' '}
                        :{' '}
                        {new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
                          dateStyle: 'long',
                          timeZone: 'Europe/Paris',
                        }).format(new Date(subscription.periodEnd))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {copy(
                  'Aucun abonnement confirmé pour le moment.',
                  'No confirmed subscription yet.',
                )}
              </p>
            )}
            {state.hasCustomer && (
              <button
                className="btn primary"
                disabled={Boolean(pending)}
                aria-busy={pending === 'portal'}
                onClick={() => void action('portal')}
              >
                {copy('Gérer l’abonnement et les factures', 'Manage subscription and invoices')}
              </button>
            )}
            <p className={styles.small}>
              {copy(
                'Le portail sécurisé permet de consulter vos factures et de gérer les options activées par Écartéo.',
                'Use the secure portal to view invoices and manage the options enabled by Écartéo.',
              )}
            </p>
          </section>
          {!hasSubscription && (
            <section aria-labelledby="available-plans">
              <h2 id="available-plans">{copy('Offres disponibles', 'Available plans')}</h2>
              {state.plans.length ? (
                <div className={styles.plans}>
                  {state.plans.map((plan) => (
                    <article className={styles.panel} key={plan.id}>
                      <h3>{plan.name}</h3>
                      <p className={styles.price}>
                        {billingAmount(plan.amount, plan.currency, locale)}{' '}
                        <span>
                          / {plan.intervalCount > 1 ? `${plan.intervalCount} ` : ''}
                          {intervalLabels[plan.interval] || plan.interval}
                          {plan.intervalCount > 1 && (locale === 'en' || plan.interval !== 'month')
                            ? 's'
                            : ''}
                        </span>
                      </p>
                      <p className={styles.small}>
                        {copy(
                          'Le montant final et les taxes applicables sont présentés avant confirmation du paiement.',
                          'The final amount and applicable taxes are shown before you confirm payment.',
                        )}
                      </p>
                      <button
                        className="btn primary"
                        disabled={Boolean(pending)}
                        aria-busy={pending === plan.id}
                        onClick={() => void action('checkout', plan.id)}
                      >
                        {state.pendingCheckout
                          ? copy('Continuer la souscription', 'Continue subscription')
                          : copy('Souscrire', 'Subscribe')}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p>
                  {copy(
                    'Contactez votre interlocuteur Écartéo pour une offre adaptée.',
                    'Contact your Écartéo representative for a suitable plan.',
                  )}
                </p>
              )}
            </section>
          )}
          {state.pendingCheckout && (
            <section className={styles.notice}>
              <h2>{copy('Demande de paiement en cours', 'Payment request in progress')}</h2>
              <p>
                {copy(
                  'Vous pouvez la reprendre avec la même offre, ou l’annuler avant de choisir une autre offre.',
                  'You can resume it with the same plan, or cancel it before choosing another plan.',
                )}
              </p>
              <button
                className="btn"
                disabled={Boolean(pending)}
                onClick={() => void action('cancel-checkout')}
              >
                {copy('Annuler la demande de paiement', 'Cancel payment request')}
              </button>
            </section>
          )}
        </>
      )}
      <p className={styles.small}>
        {copy(
          'La souscription ne lance pas automatiquement un audit. Chaque mission est cadrée et planifiée avec l’équipe Écartéo.',
          'Subscribing does not automatically start an audit. Each mission is scoped and scheduled with the Écartéo team.',
        )}
      </p>
    </main>
  );
}
