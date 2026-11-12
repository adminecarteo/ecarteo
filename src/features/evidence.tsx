'use client';

import { useState } from 'react';
import {
  ClientFilter,
  EmptyState,
  EvidenceCard,
  Field,
  PageHeader,
  Pagination,
} from '@/components/ui';
import { EVTYPES } from '@/domain/reference';
import type { EvidenceType } from '@/domain/types';
import { useConsole } from '@/lib/console-context';

const PAGE_SIZE = 12;

export function EvidenceVault() {
  const { state, t, tx, locale, clientFilter } = useConsole();
  const [type, setType] = useState<EvidenceType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const missions = new Map(state.missions.map((mission) => [mission.id, mission]));
  const filtered = state.evidence
    .filter((item) => {
      const mission = missions.get(item.missionId);
      return (
        mission &&
        (clientFilter === 'all' || mission.scenarioSnapshot.clientId === clientFilter) &&
        (type === 'all' || item.type === type) &&
        `${tx(item.label)} ${tx(item.text)} ${item.file ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(search.toLocaleLowerCase(locale))
      );
    })
    .sort((left, right) => right.at.localeCompare(left.at));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

  return (
    <>
      <PageHeader
        eyebrow={t('pEyebrow')}
        title={t('pTitle')}
        description={t('pSub')}
        actions={
          <>
            <ClientFilter />
            <Field label={t('type')}>
              <select
                style={{ width: 'auto' }}
                value={type}
                onChange={(event) => {
                  setType(event.target.value as EvidenceType | 'all');
                  setPage(1);
                }}
              >
                <option value="all">{t('allTypes')}</option>
                {(Object.keys(EVTYPES) as EvidenceType[]).map((value) => (
                  <option key={value} value={value}>
                    {tx(EVTYPES[value])}
                  </option>
                ))}
              </select>
            </Field>
          </>
        }
      />
      <div className="callout">{t('retention')}</div>
      <Field label={tx({ fr: 'Rechercher une preuve', en: 'Search evidence' })}>
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={tx({
            fr: 'Intitulé, observation ou nom de fichier',
            en: 'Title, observation or filename',
          })}
        />
      </Field>
      {filtered.length ? (
        <div className="ev">
          {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((item) => (
            <EvidenceCard key={item.id} evidence={item} />
          ))}
        </div>
      ) : (
        <EmptyState>{t('noEvFilter')}</EmptyState>
      )}
      <Pagination
        page={currentPage}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </>
  );
}

export default EvidenceVault;
