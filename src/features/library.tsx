'use client';

import { useState } from 'react';
import { Button, Card, PageHeader, Field } from '@/components/ui';
import { FAMILIES } from '@/domain/reference';
import { useConsole } from '@/lib/console-context';
import { SCENARIO_TEMPLATES, SECTOR_GUIDES } from '@/domain/scenario-library';

export default function Library() {
  const { t, tx, notify, state, role, clientFilter, execute, navigate, busy, locale } =
    useConsole();
  const [sector, setSector] = useState('all');
  const [clientId, setClientId] = useState(
    clientFilter !== 'all' ? clientFilter : (state.clients[0]?.id ?? ''),
  );
  const [error, setError] = useState('');

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(t('copied'));
    } catch {
      notify(t('copyFail'));
    }
  }

  return (
    <>
      <PageHeader eyebrow={t('bEyebrow')} title={t('bTitle')} description={t('bSub')} />
      {role !== 'client' && (
        <>
          <Card className="stack">
            <h2>{locale === 'fr' ? '12 parcours · 4 secteurs' : '12 journeys · 4 sectors'}</h2>
            <p>
              {locale === 'fr'
                ? 'Chaque modèle crée un brouillon. Adaptez le périmètre, l’identité et les seuils au mandat du client, puis faites valider le scénario avant l’exécution.'
                : 'Each template creates a draft. Adapt scope, identity and thresholds to the client mandate, then approve the scenario before execution.'}
            </p>
            <div className="row2">
              <Field label={locale === 'fr' ? 'Secteur' : 'Sector'}>
                <select value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="all">
                    {locale === 'fr' ? 'Tous les secteurs' : 'All sectors'}
                  </option>
                  {SECTOR_GUIDES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {tx(s.name)}
                    </option>
                  ))}
                </select>
              </Field>
              {role === 'qualite' && (
                <Field
                  label={
                    locale === 'fr' ? 'Client du nouveau brouillon' : 'Client for the new draft'
                  }
                >
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">
                      {locale === 'fr' ? 'Choisir un client' : 'Choose a client'}
                    </option>
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}
          </Card>
          {SECTOR_GUIDES.filter((s) => sector === 'all' || sector === s.id).map((s) => (
            <section key={s.id} className="library-sector" aria-labelledby={`sector-${s.id}`}>
              <h2 id={`sector-${s.id}`}>{tx(s.name)}</h2>
              <p className="muted">{tx(s.checks)}</p>
              <div className="lib">
                {SCENARIO_TEMPLATES.filter((template) => template.sector === s.id).map(
                  (template) => (
                    <Card key={template.id}>
                      <h3>{tx(template.draft.title)}</h3>
                      <p>{tx(template.draft.objective)}</p>
                      <ol>
                        {template.draft.steps.map((step, i) => (
                          <li key={i}>{tx(step.label)}</li>
                        ))}
                      </ol>
                      {role === 'qualite' && (
                        <Button
                          size="sm"
                          disabled={busy || !clientId}
                          onClick={async () => {
                            setError('');
                            try {
                              const result = await execute({
                                type: 'scenario.create',
                                draft: { ...template.draft, clientId },
                              });
                              notify(
                                locale === 'fr'
                                  ? 'Brouillon créé. Vérifiez le cadrage avant validation.'
                                  : 'Draft created. Review the scope before approval.',
                              );
                              navigate('scenarios', result.entityId);
                            } catch (cause) {
                              setError(cause instanceof Error ? cause.message : 'Error');
                            }
                          }}
                        >
                          {locale === 'fr' ? 'Créer un brouillon' : 'Create draft'}
                        </Button>
                      )}
                    </Card>
                  ),
                )}
              </div>
            </section>
          ))}
        </>
      )}
      <div className="lib">
        {FAMILIES.map((family) => (
          <Card key={family.id}>
            <div className="ch">
              <h2>{tx(family.name)}</h2>
              <span className="chip">{tx(family.fix)}</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>
              {t('testType', tx(family.ex), tx(family.ind))}
            </p>
            <blockquote>{tx(family.tpl)}</blockquote>
            <Button
              size="sm"
              aria-label={`${t('copy')} — ${tx(family.name)}`}
              onClick={() => void copy(tx(family.tpl))}
            >
              {t('copy')}
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}
