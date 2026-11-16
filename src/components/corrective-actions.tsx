'use client';

import { useState } from 'react';
import type { CorrectiveAction } from '@/domain/types';
import { useConsole } from '@/lib/console-context';
import { formatDate } from '@/lib/i18n';
import { EmptyState } from './ui';

export function CorrectiveActions({
  actions,
  showClient = false,
}: {
  actions: CorrectiveAction[];
  showClient?: boolean;
}) {
  const { state, locale, t, tx, execute, busy, notify } = useConsole();
  const [error, setError] = useState('');

  async function update(id: string, done: boolean) {
    setError('');
    try {
      await execute({ type: 'action.toggle', id, done });
      notify(t(done ? 'actDone' : 'actOpen'));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : locale === 'fr'
            ? 'Impossible de mettre à jour l’action.'
            : 'Could not update the action.',
      );
    }
  }

  return (
    <>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className={showClient ? 'acts-list actions-scroll' : 'acts-list'}>
        {[...actions]
          .sort((a, b) => Number(a.done) - Number(b.done) || a.horizon - b.horizon)
          .map((action) => {
            const mission =
              showClient && state.missions.find((entry) => entry.id === action.missionId);
            const client =
              mission &&
              state.clients.find((entry) => entry.id === mission.scenarioSnapshot.clientId);
            return (
              <div className={`act ${action.done ? 'done' : ''}`} key={action.id}>
                <input
                  type="checkbox"
                  id={`action-${action.id}`}
                  checked={action.done}
                  disabled={busy}
                  onChange={(event) => void update(action.id, event.target.checked)}
                />
                <label htmlFor={`action-${action.id}`}>
                  <span className="tx">{tx(action.text)}</span>
                  <br />
                  <span className="muted chart-alt">
                    {tx(action.owner) || t('ownerTbd')}
                    {client && ` · ${client.name}`}
                  </span>
                  <br />
                  <span className="muted chart-alt">
                    {locale === 'fr' ? 'Échéance' : 'Due'} : {formatDate(action.dueAt, locale)}
                  </span>
                </label>
                <span className={`hz hz${action.horizon}`}>
                  {action.horizon} {t('d')}
                </span>
              </div>
            );
          })}
        {!actions.length && <EmptyState>{t('noActions')}</EmptyState>}
      </div>
    </>
  );
}
