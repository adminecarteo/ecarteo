import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCommand,
  canAccessMission,
  canCompareMissions,
  DomainError,
  levelOf,
  missionElapsed,
  scopedState,
  scoreOf,
  scoringFingerprint,
} from '../src/domain/commands';
import { CRITERIA } from '../src/domain/reference';
import { createSeedState } from '../src/domain/seed';
import type { Actor, AppState, Command, Rating, ScenarioDraft, Scores } from '../src/domain/types';

const quality: Actor = { role: 'qualite', name: 'Nadia R.' };
const operator: Actor = { role: 'operateur', name: 'Inès B.' };
const client: Actor = { role: 'client', name: 'Client Tilleuls', clientId: 'c1' };
function allScores(value: Rating): Scores {
  return Object.fromEntries(CRITERIA.map((item) => [item.id, value]));
}
function run(state: AppState, command: Command, actor = quality) {
  return applyCommand(state, command, actor).state;
}
function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('Expected a DomainError');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}
afterEach(() => vi.useRealTimers());

describe('published scoring rules', () => {
  it('preserves prototype scores and excludes non-applicable weights', () => {
    const state = createSeedState();
    for (const [id, expected] of Object.entries({
      m1: 43,
      m9: 60,
      m2: 78,
      m8: 56,
      m3: 74,
      m4: 40,
    })) {
      expect(scoreOf(state.missions.find((mission) => mission.id === id))).toBe(expected);
    }
    expect(scoreOf({ scores: { dispo: 4, lang: null } })).toBe(100);
    expect(scoreOf({ scores: {} })).toBeNull();
    expect(scoreOf({ scores: allScores(null) })).toBeNull();
  });
  it('uses inclusive boundaries and critical override', () => {
    expect([0, 39, 40, 59, 60, 79, 80, 100].map((score) => levelOf(score))).toEqual([
      'crit',
      'crit',
      'bad',
      'bad',
      'warn',
      'warn',
      'ok',
      'ok',
    ]);
    expect(levelOf(100, true)).toBe('crit');
    expect(levelOf(null, true)).toBeNull();
  });
  it('refuses missing criteria and all-n/a approval without mutating the input', () => {
    const initial = createSeedState();
    const copy = structuredClone(initial);
    expectCode(
      () => run(initial, { type: 'mission.approve', id: 'm7', actions: [] }),
      'UNRATED_CRITERIA',
    );
    expect(initial).toEqual(copy);
    const scored = run(initial, {
      type: 'mission.score',
      id: 'm7',
      scores: allScores(null),
      comments: {},
      critical: false,
    });
    expectCode(
      () => run(scored, { type: 'mission.approve', id: 'm7', actions: [] }),
      'NO_APPLICABLE_CRITERIA',
    );
  });
  it('rejects invalid score values even when an untyped caller supplies them', () => {
    expectCode(
      () =>
        run(createSeedState(), {
          type: 'mission.score',
          id: 'm7',
          scores: { dispo: 5 as Rating },
          comments: {},
          critical: false,
        }),
      'INVALID_INPUT',
    );
  });
});

describe('permission and status boundary', () => {
  it('limits operators to assigned missions and clients to their published results', () => {
    const state = createSeedState();
    expect(
      canAccessMission(
        state,
        state.missions.find((m) => m.id === 'm5')!,
        operator,
      ),
    ).toBe(true);
    expect(
      canAccessMission(
        state,
        state.missions.find((m) => m.id === 'm7')!,
        operator,
      ),
    ).toBe(false);
    expect(
      canAccessMission(
        state,
        state.missions.find((m) => m.id === 'm4')!,
        client,
      ),
    ).toBe(false);
    expect(
      scopedState(state, client)
        .missions.map((m) => m.id)
        .sort(),
    ).toEqual(['m1', 'm2', 'm9']);
    expect(
      scopedState(state, operator).evidence.every(
        (entry) => state.missions.find((m) => m.id === entry.missionId)!.operator === operator.name,
      ),
    ).toBe(true);
  });
  it('enforces permissions on mutations, independently of visible UI', () => {
    const state = createSeedState();
    expectCode(
      () => run(state, { type: 'mission.timer', id: 'm6', running: true }, operator),
      'FORBIDDEN',
    );
    expectCode(
      () =>
        run(
          state,
          { type: 'mission.score', id: 'm7', scores: {}, comments: {}, critical: false },
          operator,
        ),
      'FORBIDDEN',
    );
    expectCode(() => run(state, { type: 'scenario.approve', id: 's5' }, client), 'FORBIDDEN');
    expectCode(
      () => run(state, { type: 'action.toggle', id: 'a6', done: true }, client),
      'FORBIDDEN',
    );
    expectCode(
      () => run(state, { type: 'action.toggle', id: 'a1', done: true }, operator),
      'FORBIDDEN',
    );
  });
  it('rejects edits after submission and prevents scoring before submission', () => {
    const state = createSeedState();
    expectCode(
      () => run(state, { type: 'mission.step', id: 'm7', index: 0, note: 'changed' }),
      'INVALID_STATE',
    );
    expectCode(
      () =>
        run(state, {
          type: 'mission.score',
          id: 'm5',
          scores: allScores(4),
          comments: {},
          critical: false,
        }),
      'INVALID_STATE',
    );
    expectCode(() => run(state, { type: 'mission.submit', id: 'm6' }), 'INVALID_STATE');
  });
});

describe('mission execution', () => {
  it('preserves elapsed time through repeated starts, pauses, and resume', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T10:00:00Z'));
    let state = createSeedState();
    state = run(state, { type: 'mission.timer', id: 'm6', running: true });
    vi.advanceTimersByTime(5000);
    state = run(state, { type: 'mission.timer', id: 'm6', running: true });
    vi.advanceTimersByTime(5000);
    state = run(state, { type: 'mission.timer', id: 'm6', running: false });
    expect(state.missions.find((m) => m.id === 'm6')!.elapsed).toBe(10000);
    vi.advanceTimersByTime(9000);
    state = run(state, { type: 'mission.timer', id: 'm6', running: false });
    state = run(state, { type: 'mission.timer', id: 'm6', running: true });
    vi.advanceTimersByTime(3000);
    const mission = state.missions.find((m) => m.id === 'm6')!;
    expect(missionElapsed(mission)).toBe(13000);
    expect(
      mission.log.filter(
        (entry) => typeof entry.text !== 'string' && entry.text.en === 'Timer paused',
      ),
    ).toHaveLength(1);
  });
  it('saves notes and requires explicit override for incomplete steps', () => {
    const initial = createSeedState();
    let state = run(
      initial,
      { type: 'mission.step', id: 'm5', index: 2, note: 'Callback received after 18 minutes.' },
      operator,
    );
    expect(state.missions.find((m) => m.id === 'm5')!.steps[2].note).toContain('18 minutes');
    expect(initial.missions.find((m) => m.id === 'm5')!.steps[2].note).toBe('');
    expectCode(
      () => run(state, { type: 'mission.submit', id: 'm5' }, operator),
      'INCOMPLETE_STEPS',
    );
    state = run(state, { type: 'mission.submit', id: 'm5', allowIncomplete: true }, operator);
    expect(state.missions.find((m) => m.id === 'm5')!.status).toBe('review');
    expect(state.missions.find((m) => m.id === 'm5')!.runningSince).toBeNull();
  });
  it('rejects stale note writes without interfering with independent step toggles', () => {
    const initial = createSeedState();
    const otherTab = run(
      initial,
      { type: 'mission.step', id: 'm5', index: 2, note: 'A newer observation', expectedNote: '' },
      operator,
    );
    expectCode(
      () =>
        run(
          otherTab,
          {
            type: 'mission.step',
            id: 'm5',
            index: 2,
            note: 'My stale observation',
            expectedNote: '',
          },
          operator,
        ),
      'NOTE_CONFLICT',
    );
    const toggled = run(
      otherTab,
      { type: 'mission.step', id: 'm5', index: 2, done: true, expectedNote: '' },
      operator,
    );
    expect(toggled.missions.find((m) => m.id === 'm5')!.steps[2]).toMatchObject({
      done: true,
      note: 'A newer observation',
    });
  });
  it('attaches evidence to the explicit mission, preserves the file reference and rejects unsafe files', () => {
    const command: Command = {
      type: 'evidence.add',
      missionId: 'm5',
      evidence: {
        type: 'fichier',
        label: 'Email response',
        text: 'Reply in English',
        file: 'reply.eml',
        fileId: 'blob-123',
        mimeType: 'message/rfc822',
        size: 256,
      },
    };
    const result = applyCommand(createSeedState(), command, operator);
    expect(result.state.evidence.find((entry) => entry.id === result.entityId)).toMatchObject({
      missionId: 'm5',
      fileId: 'blob-123',
      file: 'reply.eml',
    });
    expectCode(
      () =>
        run(
          createSeedState(),
          {
            ...command,
            evidence: { ...command.evidence, file: 'attack.html', mimeType: 'text/html' },
          },
          operator,
        ),
      'INVALID_FILE',
    );
    expectCode(
      () =>
        run(
          createSeedState(),
          { ...command, evidence: { ...command.evidence, size: 11 * 1024 * 1024 } },
          operator,
        ),
      'INVALID_FILE',
    );
  });
});

describe('approval and report history', () => {
  it('atomically saves and approves a final assessment and rejects a competing draft', () => {
    const initial = createSeedState();
    const original = initial.missions.find((m) => m.id === 'm7')!;
    const fingerprint = scoringFingerprint(original);
    const approve: Command = {
      type: 'mission.approve',
      id: 'm7',
      scores: allScores(3),
      comments: { vitesse: 'On time' },
      critical: false,
      actions: [],
      expectedScoringFingerprint: fingerprint,
    };
    const approved = run(initial, approve);
    expect(approved.missions.find((m) => m.id === 'm7')!.reportSnapshot).toMatchObject({
      score: 75,
      comments: { vitesse: 'On time' },
    });
    expect(run(approved, approve)).toEqual(approved);
    expectCode(() => run(approved, { ...approve, scores: allScores(4) }), 'SCORING_CONFLICT');
    const otherTab = run(initial, {
      type: 'mission.score',
      id: 'm7',
      scores: allScores(2),
      comments: {},
      critical: false,
    });
    expectCode(() => run(otherTab, approve), 'SCORING_CONFLICT');
    expectCode(
      () =>
        run(otherTab, {
          type: 'mission.score',
          id: 'm7',
          scores: allScores(3),
          comments: {},
          critical: false,
          expectedScoringFingerprint: fingerprint,
        }),
      'SCORING_CONFLICT',
    );
    expectCode(
      () => run(initial, { type: 'mission.approve', id: 'm7', scores: allScores(3), actions: [] }),
      'INVALID_INPUT',
    );
  });
  it('canonicalizes scoring field ordering and trimmed comment whitespace', () => {
    expect(
      scoringFingerprint({
        scores: { vitesse: 2, dispo: 3 },
        comments: { vitesse: '  Fact  ' },
        critical: false,
      }),
    ).toBe(
      scoringFingerprint({
        scores: { dispo: 3, vitesse: 2 },
        comments: { vitesse: 'Fact' },
        critical: false,
      }),
    );
    expect(scoringFingerprint({ scores: {}, comments: {}, critical: false })).not.toBe(
      scoringFingerprint({ scores: { dispo: null }, comments: {}, critical: false }),
    );
  });
  it('approves atomically once and freezes report values separately from later action changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    let state = run(createSeedState(), {
      type: 'mission.score',
      id: 'm7',
      scores: allScores(3),
      comments: { vitesse: 'Response in 6 minutes.' },
      critical: false,
    });
    const command: Command = {
      type: 'mission.approve',
      id: 'm7',
      actions: [
        { critId: 'vitesse', horizon: 7, text: 'Document response times', owner: 'Reception' },
      ],
    };
    state = run(state, command);
    const action = state.actions.find((entry) => entry.missionId === 'm7')!;
    expect(action.dueAt).toBe('2026-11-10T12:00:00.000Z');
    const snapshot = structuredClone(state.missions.find((m) => m.id === 'm7')!.reportSnapshot);
    const repeated = run(state, command);
    expect(repeated).toEqual(state);
    state = run(
      state,
      { type: 'action.toggle', id: action.id, done: true },
      { role: 'client', name: 'Arcadie', clientId: 'c2' },
    );
    expect(state.actions.find((entry) => entry.id === action.id)!.done).toBe(true);
    expect(state.missions.find((m) => m.id === 'm7')!.reportSnapshot).toEqual(snapshot);
    expectCode(
      () =>
        run(state, {
          type: 'mission.score',
          id: 'm7',
          scores: allScores(4),
          comments: {},
          critical: false,
        }),
      'INVALID_STATE',
    );
  });
  it('rejects invalid action creation without partially approving or changing the input', () => {
    const state = run(createSeedState(), {
      type: 'mission.score',
      id: 'm7',
      scores: allScores(3),
      comments: {},
      critical: false,
    });
    const copy = structuredClone(state);
    expectCode(
      () =>
        run(state, {
          type: 'mission.approve',
          id: 'm7',
          actions: [{ critId: 'vitesse', horizon: 7, text: '', owner: '' }],
        }),
      'INVALID_INPUT',
    );
    expect(state).toEqual(copy);
  });
  it('captures scenario content when a mission is created', () => {
    const result = applyCommand(
      createSeedState(),
      { type: 'mission.create', scenarioId: 's1', date: '2026-11-05', operator: 'Inès B.' },
      quality,
    );
    const mission = result.state.missions.find((entry) => entry.id === result.entityId)!;
    const original = structuredClone(mission.scenarioSnapshot);
    result.state.scenarios.find((entry) => entry.id === 's1')!.steps[0].label = 'Changed template';
    expect(mission.scenarioSnapshot).toEqual(original);
  });
});

describe('scenarios and comparable retests', () => {
  it('creates a draft, blocks scheduling before approval, then schedules a frozen mission', () => {
    const initial = createSeedState();
    const draft: ScenarioDraft = { ...initial.scenarios[0], title: 'New audit' };
    const created = applyCommand(initial, { type: 'scenario.create', draft }, quality);
    expect(created.state.scenarios.find((s) => s.id === created.entityId)!.status).toBe('draft');
    expectCode(
      () =>
        run(created.state, {
          type: 'mission.create',
          scenarioId: created.entityId!,
          date: '2026-12-01',
          operator: 'Inès B.',
        }),
      'INVALID_STATE',
    );
    const approved = run(created.state, { type: 'scenario.approve', id: created.entityId! });
    const scheduled = applyCommand(
      approved,
      {
        type: 'mission.create',
        scenarioId: created.entityId!,
        date: '2026-12-01',
        operator: 'Inès B.',
      },
      quality,
    );
    expect(scheduled.state.missions.find((m) => m.id === scheduled.entityId)!.status).toBe('todo');
  });
  it('compares only compatible chronological results', () => {
    const state = createSeedState();
    const m = (id: string) => state.missions.find((entry) => entry.id === id)!;
    expect(canCompareMissions(m('m1'), m('m2'))).toBe(true);
    expect(canCompareMissions(m('m2'), m('m1'))).toBe(false);
    expect(canCompareMissions(m('m1'), m('m1'))).toBe(false);
    expect(canCompareMissions(m('m1'), m('m3'))).toBe(false);
    expect(canCompareMissions(m('m1'), { ...m('m2'), criteriaVersion: 'new-grid' })).toBe(false);
    const changed = structuredClone(m('m2'));
    changed.scenarioSnapshot.steps[0].seuil = 'Changed threshold';
    expect(canCompareMissions(m('m1'), changed)).toBe(false);
  });
  it('preserves baseline links and exact criteria when scheduling a new retest', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const result = applyCommand(createSeedState(), { type: 'mission.retest', id: 'm2' }, quality);
    const retest = result.state.missions.find((m) => m.id === result.entityId)!;
    expect(retest).toMatchObject({
      baselineMissionId: 'm2',
      date: '2026-12-03T12:00:00.000Z',
      status: 'todo',
      criteriaVersion: 'ecarteo-v1',
    });
    expect(retest.scenarioSnapshot.parentId).toBe('s1');
    expect(retest.scenarioSnapshot.steps).toEqual(
      result.state.missions.find((m) => m.id === 'm2')!.scenarioSnapshot.steps,
    );
    expect(retest.scenarioSnapshot.steps).not.toBe(
      result.state.missions.find((m) => m.id === 'm2')!.scenarioSnapshot.steps,
    );
  });
  it('returns independent fresh seeds with chronologically valid approvals', () => {
    const state = createSeedState();
    const m1 = state.missions.find((m) => m.id === 'm1')!;
    expect(new Date(m1.validatedAt!).getTime()).toBeGreaterThan(
      new Date(m1.log.at(-1)!.at).getTime(),
    );
    state.clients[0].name = 'Changed';
    expect(createSeedState().clients[0].name).toBe('Hôtels Les Tilleuls');
  });
});
