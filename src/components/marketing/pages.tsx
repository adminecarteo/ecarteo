'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/lib/locale-context';
import { ActionLink, Arrow, AuditPreview, MarketingShell, OffersOverview } from './site';
import { getMethodSteps, getOffers } from './content';
import styles from './marketing.module.css';

export function HomePage({ publisher }: { publisher?: ReactNode }) {
  const { copy } = useLocale();
  const stages = [
    {
      title: copy('Cadrer', 'Define'),
      text: copy(
        'Définir le parcours, le périmètre et les points de contrôle.',
        'Define the journey, scope and checkpoints.',
      ),
    },
    {
      title: copy('Tester', 'Test'),
      text: copy(
        'Réaliser l’audit et relever les écarts constatés.',
        'Run the audit and record the gaps you observe.',
      ),
    },
    {
      title: copy('Corriger', 'Improve'),
      text: copy(
        'Valider les constats et prioriser les actions d’amélioration.',
        'Validate findings and prioritise improvements.',
      ),
    },
    {
      title: copy('Retester', 'Retest'),
      text: copy(
        'Rejouer le parcours pour vérifier les corrections.',
        'Repeat the journey to check the improvements.',
      ),
    },
  ];
  return (
    <MarketingShell publisher={publisher}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>
            {copy('Mesurez l’écart.', 'Measure the gap.')}
            <br />
            {copy('Corrigez l’expérience.', 'Improve the experience.')}
          </h1>
          <p>
            {copy(
              'La plateforme d’audit du parcours client pour identifier les écarts, documenter les constats et piloter les actions d’amélioration.',
              'The customer journey audit platform for identifying gaps, documenting findings and managing improvements.',
            )}
          </p>
          <div className={styles.heroActions}>
            <ActionLink href="/signup">
              {copy('Créer mon espace', 'Create my workspace')}
            </ActionLink>
            <ActionLink href="/methode" secondary light>
              {copy('Découvrir la méthode', 'Explore the method')}
            </ActionLink>
          </div>
        </div>
        <AuditPreview />
      </section>
      <section className={`${styles.section} ${styles.methodSection}`}>
        <h2>{copy('De l’observation au progrès.', 'From observation to improvement.')}</h2>
        <ol className={styles.methodOverview}>
          {stages.map((stage, index) => (
            <li key={index}>
              <div>
                <span className={styles.stepNumber}>{index + 1}</span>
                <h3>{stage.title}</h3>
                <span className={styles.stepConnector} aria-hidden="true" />
              </div>
              <p>{stage.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className={`${styles.section} ${styles.offersSection}`}>
        <h2>{copy('Nos offres d’audit', 'Our audit offers')}</h2>
        <OffersOverview />
      </section>
    </MarketingShell>
  );
}

export function MethodPageContent({ publisher }: { publisher?: ReactNode }) {
  const { locale, copy } = useLocale();
  return (
    <MarketingShell publisher={publisher} current="methode">
      <section className={styles.innerHero}>
        <p className={styles.sectionLabel}>{copy('La méthode Écartéo', 'The Écartéo method')}</p>
        <h1>
          {copy('De la première demande', 'From the first enquiry')}
          <br />
          {copy('au prochain progrès.', 'to the next improvement.')}
        </h1>
        <p>
          {copy(
            'Huit étapes pour rendre les écarts visibles, les comprendre et vérifier que les corrections produisent un changement.',
            'Eight steps to reveal gaps, understand them and verify that improvements make a difference.',
          )}
        </p>
        <ActionLink href="/signup">{copy('Créer mon espace', 'Create my workspace')}</ActionLink>
      </section>
      <section
        className={`${styles.section} ${styles.fullMethod}`}
        aria-label={copy('Les huit étapes de la méthode', 'The eight steps of the method')}
      >
        <ol>
          {getMethodSteps(locale).map((step) => (
            <li key={step.number}>
              <span className={styles.stepNumber}>{step.number}</span>
              <div>
                <h2>{step.title}</h2>
                <p className={styles.methodDescription}>{step.description}</p>
              </div>
              <p className={styles.methodDetail}>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className={styles.rolesSection}>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>
              {copy('Chaque rôle,', 'Every role,')}
              <br />
              {copy('une responsabilité claire.', 'a clear responsibility.')}
            </h2>
            <p>
              {copy(
                'La console organise le travail. Les décisions sensibles et l’interprétation restent sous responsabilité humaine.',
                'The console organises the work. Sensitive decisions and interpretation remain a human responsibility.',
              )}
            </p>
          </div>
          <div className={styles.rolesGrid}>
            <article>
              <span>{copy('Exécution', 'Execution')}</span>
              <h3>{copy('L’opérateur', 'The operator')}</h3>
              <p>
                {copy(
                  'Suit les étapes de la mission, consigne les observations et rassemble les pièces utiles.',
                  'Follows the audit steps, records observations and collects the relevant evidence.',
                )}
              </p>
            </article>
            <article>
              <span>{copy('Validation', 'Approval')}</span>
              <h3>{copy('Le responsable qualité', 'The quality lead')}</h3>
              <p>
                {copy(
                  'Valide les scénarios, relit la notation et publie le rapport avec un plan d’actions.',
                  'Approves scenarios, reviews scoring and publishes the report with an action plan.',
                )}
              </p>
            </article>
            <article>
              <span>{copy('Amélioration', 'Improvement')}</span>
              <h3>{copy('L’équipe cliente', 'The customer team')}</h3>
              <p>
                {copy(
                  'Consulte les résultats validés, suit les actions et observe les évolutions au retest.',
                  'Reviews approved results, tracks actions and measures progress during the retest.',
                )}
              </p>
            </article>
          </div>
        </div>
      </section>
      <section className={`${styles.section} ${styles.methodPrinciple}`}>
        <p className={styles.sectionLabel}>{copy('Un cadre explicite', 'Clear boundaries')}</p>
        <h2>
          {copy('Tester le système.', 'Test the system.')}
          <br />
          {copy('Contextualiser les observations.', 'Put observations in context.')}
        </h2>
        <p>
          {copy(
            'Le périmètre, les exclusions et les preuves attendues sont définis avant l’exécution. L’évaluation porte sur le parcours et ses procédures. Les scénarios dangereux, les faux documents officiels et les enregistrements clandestins sont exclus de la méthode.',
            'The scope, exclusions and expected evidence are defined before execution. The assessment covers the journey and its procedures. Dangerous scenarios, forged official documents and covert recordings are excluded from the method.',
          )}
        </p>
      </section>
    </MarketingShell>
  );
}

export function OffersPageContent({ publisher }: { publisher?: ReactNode }) {
  const { locale, copy } = useLocale();
  return (
    <MarketingShell publisher={publisher} current="offres">
      <section className={styles.innerHero}>
        <p className={styles.sectionLabel}>{copy('Les offres Écartéo', 'Écartéo offers')}</p>
        <h1>
          {copy('Le bon périmètre.', 'The right scope.')}
          <br />
          {copy('Des résultats exploitables.', 'Results you can act on.')}
        </h1>
        <p>
          {copy(
            'Un audit ponctuel pour commencer, un suivi régulier pour progresser ou un cadre partagé à l’échelle de votre réseau.',
            'Start with a one-off audit, improve through regular monitoring or adopt a shared framework across your network.',
          )}
        </p>
      </section>
      <section
        className={styles.section}
        aria-label={copy('Les périmètres d’audit', 'Audit scopes')}
      >
        {getOffers(locale).map((offer) => (
          <article key={offer.id} id={offer.id} className={styles.fullOffer}>
            <div>
              <p className={styles.offerScope}>{offer.scope}</p>
              <h2>{offer.name}</h2>
              <p>{offer.description}</p>
            </div>
            <div>
              <h3>{copy('Ce que comprend le périmètre', 'What is included')}</h3>
              <ul>
                {offer.features.map((feature) => (
                  <li key={feature}>
                    <Arrow />
                    {feature}
                  </li>
                ))}
              </ul>
              {offer.id === 'suivi' && (
                <p className={styles.offerDetail}>
                  {copy(
                    'Les formules Essentiel et Performance adaptent le nombre de scénarios, les canaux, les langues et la fréquence de retest au besoin de l’équipe.',
                    'The Essentiel and Performance packages adapt the scenario count, channels, languages and retest frequency to the team’s needs.',
                  )}
                </p>
              )}
              {offer.id === 'reseaux' && (
                <p className={styles.offerDetail}>
                  {copy(
                    'L’échantillonnage des établissements et la capacité linguistique sont définis avant le lancement de la mission.',
                    'Site sampling and language capabilities are agreed before the audit begins.',
                  )}
                </p>
              )}
              <ActionLink href={`/signup?offer=${offer.id}`}>
                {copy(`Demander : ${offer.name}`, `Request: ${offer.name}`)}
              </ActionLink>
            </div>
          </article>
        ))}
      </section>
      <section className={styles.rolesSection}>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>
              {copy('Prolonger l’audit', 'Turn the audit')}
              <br />
              {copy('par des changements concrets.', 'into practical changes.')}
            </h2>
            <p>
              {copy(
                'Le périmètre de chaque mission et ses conditions commerciales sont définis avant son lancement. La création d’un compte ne vaut pas commande d’un audit.',
                'Each audit’s scope and commercial terms are agreed before it begins. Creating an account does not place an audit order.',
              )}
            </p>
          </div>
          <div className={styles.complements}>
            <article>
              <h3>{copy('Formation corrective', 'Targeted training')}</h3>
              <p>
                {copy(
                  'Scripts, procédures, microformations et ateliers pour aider les équipes à appliquer les recommandations.',
                  'Scripts, procedures, short training sessions and workshops help teams put recommendations into practice.',
                )}
              </p>
            </article>
            <article>
              <h3>{copy('Audit international', 'International audits')}</h3>
              <p>
                {copy(
                  'Des parcours dans plusieurs langues pour examiner l’orientation, la compréhension et la qualité des réponses.',
                  'Journeys in several languages to assess guidance, understanding and response quality.',
                )}
              </p>
            </article>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
