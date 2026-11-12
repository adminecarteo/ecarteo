import { describe, it, expect } from 'vitest';
import { applyCommand, scenarioFingerprint } from '@/domain/commands';
import { createSeedState } from '@/domain/seed';
import type { ScenarioDraft, Actor } from '@/domain/types';
const actor: Actor = { role: 'qualite', name: 'Quality' };
describe('scenario draft editing', () => {
  it('updates only drafts, preserving identity and rejecting stale content', () => {
    const initial = createSeedState();
    const draft: ScenarioDraft = { ...initial.scenarios[0], title: 'Editable draft' };
    const created = applyCommand(initial, { type: 'scenario.create', draft }, actor);
    const scenario = created.state.scenarios.find((s) => s.id === created.entityId)!;
    const command = {
      type: 'scenario.update' as const,
      id: scenario.id,
      draft: { ...draft, title: 'Updated protocol' },
      expectedFingerprint: scenarioFingerprint(scenario),
    };
    const result = applyCommand(created.state, command, actor);
    expect(result.state.scenarios.find((s) => s.id === scenario.id)).toMatchObject({
      title: 'Updated protocol',
      clientId: scenario.clientId,
      parentId: null,
      status: 'draft',
    });
    expect(() => applyCommand(result.state, command, actor)).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_CONFLICT' }),
    );
    expect(() =>
      applyCommand(created.state, { ...command, draft: { ...draft, clientId: 'c2' } }, actor),
    ).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    const approved = applyCommand(
      result.state,
      { type: 'scenario.approve', id: scenario.id },
      actor,
    );
    const frozen = approved.state.scenarios.find((s) => s.id === scenario.id)!;
    expect(() =>
      applyCommand(
        approved.state,
        { ...command, expectedFingerprint: scenarioFingerprint(frozen) },
        actor,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }));
  });
  it('cannot approve an incomplete intake protocol; a valid edit unlocks approval', () => {
    const state = createSeedState();
    const scenario = state.scenarios[0];
    scenario.status = 'draft';
    scenario.steps = [{ label: '', seuil: '' }];
    expect(() =>
      applyCommand(state, { type: 'scenario.approve', id: scenario.id }, actor),
    ).toThrowError(expect.objectContaining({ code: 'STEP_REQUIRED' }));
    const draft: ScenarioDraft = {
      ...scenario,
      steps: [{ label: 'Envoyer la demande de test', seuil: 'Réponse dans le délai contractuel' }],
    };
    const edited = applyCommand(
      state,
      {
        type: 'scenario.update',
        id: scenario.id,
        draft,
        expectedFingerprint: scenarioFingerprint(scenario),
      },
      actor,
    );
    expect(
      applyCommand(edited.state, { type: 'scenario.approve', id: scenario.id }, actor).state
        .scenarios[0].status,
    ).toBe('validated');
  });
});
