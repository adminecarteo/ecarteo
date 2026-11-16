import {
  CHANNELS,
  CRITERIA,
  CRITERIA_VERSION,
  EVIDENCE_EXPECTED,
  EVTYPES,
  FAMILIES,
  LANGS,
  OPERATORS,
} from './reference';
import type {
  ActionDraft,
  Actor,
  AppState,
  Command,
  CommandResult,
  CorrectiveAction,
  Level,
  Localized,
  Comments,
  Mission,
  PublishedReport,
  Rating,
  Scenario,
  ScenarioDraft,
  ScoringActionDraft,
  Scores,
} from './types';

export type { Actor, AppState, Command, CommandResult, ScenarioDraft, ActionDraft } from './types';

const ERRORS = {
  FORBIDDEN: [
    'Vous n’avez pas accès à cette opération.',
    'You do not have access to this operation.',
  ],
  NOT_FOUND: ['Cet élément est introuvable.', 'This item could not be found.'],
  INVALID_STATE: [
    'Cette opération n’est pas possible dans cet état.',
    'This operation is not available in the current state.',
  ],
  INVALID_INPUT: ['Vérifiez les informations saisies.', 'Check the information entered.'],
  TITLE_REQUIRED: ['Donnez un titre au parcours.', 'Give the journey a title.'],
  CHANNEL_REQUIRED: ['Choisissez au moins un canal.', 'Choose at least one channel.'],
  STEP_REQUIRED: [
    'Ajoutez au moins une étape avec une action.',
    'Add at least one step with an action.',
  ],
  INCOMPLETE_STEPS: [
    'Des étapes ne sont pas terminées. Confirmez leur soumission.',
    'Some steps are incomplete. Confirm submission to continue.',
  ],
  UNRATED_CRITERIA: [
    'Notez tous les critères, ou indiquez n/a.',
    'Rate every criterion, or mark it n/a.',
  ],
  NO_APPLICABLE_CRITERIA: [
    'Au moins un critère doit avoir une note de 0 à 4.',
    'At least one criterion must have a rating from 0 to 4.',
  ],
  EVIDENCE_REQUIRED: ['Ajoutez un intitulé ou un fichier.', 'Add a title or a file.'],
  INVALID_FILE: [
    'Le fichier n’est pas valide ou dépasse 10 Mo.',
    'The file is invalid or exceeds 10 MB.',
  ],
  SCORING_CONFLICT: [
    'Cette notation a changé dans une autre fenêtre. Rechargez la dernière version avant de continuer.',
    'This assessment changed in another window. Reload the latest version before continuing.',
  ],
  NOTE_CONFLICT: [
    'Cette observation a changé dans une autre fenêtre. Rechargez-la avant de l’enregistrer.',
    'This observation changed in another window. Reload it before saving.',
  ],
  SCENARIO_CONFLICT: [
    'Ce scénario a changé. Rechargez sa dernière version avant de l’enregistrer.',
    'This scenario changed. Reload its latest version before saving.',
  ],
} as const;
export type DomainErrorCode = keyof typeof ERRORS;
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly messages: { fr: string; en: string };
  constructor(code: DomainErrorCode) {
    super(ERRORS[code][0]);
    this.name = 'DomainError';
    this.code = code;
    this.messages = { fr: ERRORS[code][0], en: ERRORS[code][1] };
  }
}
function assert(condition: unknown, code: DomainErrorCode): asserts condition {
  if (!condition) throw new DomainError(code);
}
function quality(actor: Actor) {
  assert(actor.role === 'qualite', 'FORBIDDEN');
}
function textPresent(text: Localized | undefined): boolean {
  return typeof text === 'string'
    ? Boolean(text.trim())
    : Boolean(text && (text.fr?.trim() || text.en?.trim()));
}
function cleanText(text: Localized, max = 10000): Localized {
  if (typeof text === 'string') {
    assert(text.length <= max, 'INVALID_INPUT');
    return text.trim();
  }
  assert(text && typeof text.fr === 'string' && typeof text.en === 'string', 'INVALID_INPUT');
  assert(text.fr.length <= max && text.en.length <= max, 'INVALID_INPUT');
  return { fr: text.fr.trim(), en: text.en.trim() };
}
function bilingual(fr: string, en: string): Localized {
  return { fr, en };
}
export interface CommandOptions {
  operators?: { id: string; name: string }[];
  createId?: (prefix: string) => string;
}
function id(prefix: string, options?: CommandOptions): string {
  return options?.createId ? options.createId(prefix) : `${prefix}_${crypto.randomUUID()}`;
}
function findMission(state: AppState, missionId: string): Mission {
  const mission = state.missions.find((entry) => entry.id === missionId);
  assert(mission, 'NOT_FOUND');
  return mission;
}
function findScenario(state: AppState, scenarioId: string): Scenario {
  const scenario = state.scenarios.find((entry) => entry.id === scenarioId);
  assert(scenario, 'NOT_FOUND');
  return scenario;
}
function event(mission: Mission, at: string, fr: string, en: string) {
  mission.log.push({ at, text: bilingual(fr, en) });
}
function isoDate(value: string): string {
  assert(typeof value === 'string' && value.trim(), 'INVALID_INPUT');
  const date = new Date(value.length === 10 ? `${value}T09:00:00.000Z` : value);
  assert(Number.isFinite(date.getTime()), 'INVALID_INPUT');
  return date.toISOString();
}
function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function scoreOf(mission: Pick<Mission, 'scores'> | null | undefined): number | null {
  if (!mission?.scores) return null;
  let weighted = 0;
  let totalWeight = 0;
  for (const criterion of CRITERIA) {
    const value = mission.scores[criterion.id];
    if (value === null || value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > 4) return null;
    weighted += (criterion.w * value) / 4;
    totalWeight += criterion.w;
  }
  return totalWeight ? Math.round((weighted / totalWeight) * 100) : null;
}
export function levelOf(score: number | null | undefined, critical = false): Level | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  if (critical) return 'crit';
  return score >= 80 ? 'ok' : score >= 60 ? 'warn' : score >= 40 ? 'bad' : 'crit';
}
export function missionElapsed(
  mission: Pick<Mission, 'elapsed' | 'runningSince'>,
  now = Date.now(),
): number {
  return (
    Math.max(0, mission.elapsed) +
    (mission.runningSince === null ? 0 : Math.max(0, now - mission.runningSince))
  );
}
/** Canonical assessment identity for optimistic concurrency, not a security credential. */
export function scoringFingerprint(
  mission: Pick<Mission, 'scores' | 'comments' | 'critical' | 'scoringDraft'>,
): string {
  const comment = (value: Localized | undefined) =>
    typeof value === 'string'
      ? value.trim()
      : value
        ? { fr: value.fr.trim(), en: value.en.trim() }
        : '';
  return JSON.stringify({
    scores: CRITERIA.map(({ id }) => [
      id,
      mission.scores[id] === undefined ? 'unrated' : mission.scores[id],
    ]),
    comments: CRITERIA.map(({ id }) => [id, comment(mission.comments[id])]),
    critical: mission.critical,
    ...(mission.scoringDraft ? { draftRevision: mission.scoringDraft.revision } : {}),
  });
}
function checkScoringFingerprint(mission: Mission, expected: string | undefined) {
  if (mission.scoringDraft) assert(expected !== undefined, 'SCORING_CONFLICT');
  if (expected !== undefined) assert(expected === scoringFingerprint(mission), 'SCORING_CONFLICT');
}
function cleanDraftActions(actions: ScoringActionDraft[]): ScoringActionDraft[] {
  assert(Array.isArray(actions) && actions.length <= CRITERIA.length, 'INVALID_INPUT');
  const seen = new Set<string>();
  return actions.map((action) => {
    assert(
      CRITERIA.some(({ id }) => id === action.critId) && !seen.has(action.critId),
      'INVALID_INPUT',
    );
    assert(
      [7, 30, 90].includes(action.horizon) && typeof action.include === 'boolean',
      'INVALID_INPUT',
    );
    seen.add(action.critId);
    return { ...action, text: cleanText(action.text, 2000), owner: cleanText(action.owner, 200) };
  });
}
function setAssessment(mission: Mission, scores: Scores, comments: Comments, critical: boolean) {
  for (const [key, value] of Object.entries(scores)) {
    assert(
      CRITERIA.some((criterion) => criterion.id === key),
      'INVALID_INPUT',
    );
    assert(
      value === null ||
        (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4),
      'INVALID_INPUT',
    );
    mission.scores[key as keyof typeof mission.scores] = value as Rating;
  }
  for (const [key, value] of Object.entries(comments)) {
    assert(
      CRITERIA.some((criterion) => criterion.id === key),
      'INVALID_INPUT',
    );
    mission.comments[key as keyof typeof mission.comments] = cleanText(value);
  }
  assert(typeof critical === 'boolean', 'INVALID_INPUT');
  mission.critical = critical;
}
export function canAccessMission(state: AppState, mission: Mission, actor: Actor): boolean {
  if (!state.missions.some((entry) => entry.id === mission.id)) return false;
  if (actor.role === 'qualite') return true;
  if (actor.role === 'operateur')
    return actor.id ? mission.operatorId === actor.id : mission.operator === actor.name;
  return (
    actor.role === 'client' &&
    Boolean(actor.clientId) &&
    mission.status === 'done' &&
    mission.scenarioSnapshot.clientId === actor.clientId
  );
}
export function scopedState(state: AppState, actor: Actor): AppState {
  if (actor.role === 'qualite') return state;
  const missions = state.missions.filter((mission) => canAccessMission(state, mission, actor));
  const missionIds = new Set(missions.map((mission) => mission.id));
  const scenarioIds = new Set(missions.map((mission) => mission.scenarioId));
  const clientIds = new Set(missions.map((mission) => mission.scenarioSnapshot.clientId));
  if (actor.role === 'client' && actor.clientId) clientIds.add(actor.clientId);
  return {
    version: state.version,
    clients: state.clients.filter((client) => clientIds.has(client.id)),
    scenarios: state.scenarios.filter((scenario) => scenarioIds.has(scenario.id)),
    missions: missions.map((mission) => {
      if (!mission.scoringDraft) return mission;
      const visible = { ...mission };
      delete visible.scoringDraft;
      return visible;
    }),
    evidence: state.evidence.filter((entry) => missionIds.has(entry.missionId)),
    actions: state.actions.filter((action) => missionIds.has(action.missionId)),
  };
}
function scenarioSignature(scenario: Scenario): string {
  return JSON.stringify({
    family: scenario.family,
    channels: [...scenario.channels].sort(),
    lang: scenario.lang,
    steps: scenario.steps,
    evidence: [...scenario.evidence].sort(),
  });
}
/** Comparisons require the same journey, scoring grid, client, and forward chronology. */
export function canCompareMissions(
  before: Mission | null | undefined,
  after: Mission | null | undefined,
): boolean {
  if (
    !before ||
    !after ||
    before.id === after.id ||
    before.status !== 'done' ||
    after.status !== 'done'
  )
    return false;
  const a = before.scenarioSnapshot,
    b = after.scenarioSnapshot;
  return (
    a.clientId === b.clientId &&
    (a.parentId || a.id) === (b.parentId || b.id) &&
    before.criteriaVersion === after.criteriaVersion &&
    new Date(before.date).getTime() < new Date(after.date).getTime() &&
    scenarioSignature(a) === scenarioSignature(b) &&
    scoreOf(before) !== null &&
    scoreOf(after) !== null
  );
}
function editableMission(state: AppState, missionId: string, actor: Actor): Mission {
  const mission = findMission(state, missionId);
  assert(actor.role !== 'client' && canAccessMission(state, mission, actor), 'FORBIDDEN');
  assert(mission.status === 'todo' || mission.status === 'doing', 'INVALID_STATE');
  return mission;
}
function start(mission: Mission, now: string, actor: Actor) {
  if (mission.runningSince !== null) return;
  const initial = mission.status === 'todo';
  mission.status = 'doing';
  mission.runningSince = new Date(now).getTime();
  event(
    mission,
    now,
    initial ? `Mission démarrée par ${actor.name}` : 'Chronomètre repris',
    initial ? `Mission started by ${actor.name}` : 'Timer resumed',
  );
}
function pause(mission: Mission, now: string) {
  if (mission.runningSince === null) return;
  mission.elapsed = missionElapsed(mission, new Date(now).getTime());
  mission.runningSince = null;
  event(mission, now, 'Chronomètre en pause', 'Timer paused');
}
function validateScenarioDraft(state: AppState, draft: ScenarioDraft): ScenarioDraft {
  assert(textPresent(draft.title), 'TITLE_REQUIRED');
  assert(
    state.clients.some((client) => client.id === draft.clientId),
    'INVALID_INPUT',
  );
  assert(
    FAMILIES.some((family) => family.id === draft.family) && Object.hasOwn(LANGS, draft.lang),
    'INVALID_INPUT',
  );
  assert(Array.isArray(draft.channels) && draft.channels.length > 0, 'CHANNEL_REQUIRED');
  assert(
    draft.channels.every((channel) => Object.hasOwn(CHANNELS, channel)),
    'INVALID_INPUT',
  );
  assert(Array.isArray(draft.steps) && draft.steps.length <= 100, 'INVALID_INPUT');
  const steps = draft.steps
    .filter((step) => textPresent(step.label))
    .map((step) => ({
      label: cleanText(step.label, 1000),
      seuil: cleanText(step.seuil, 1000),
    }));
  assert(steps.length, 'STEP_REQUIRED');
  assert(
    Array.isArray(draft.evidence) &&
      draft.evidence.every((item) => Object.hasOwn(EVIDENCE_EXPECTED, item)),
    'INVALID_INPUT',
  );
  return {
    clientId: draft.clientId,
    title: cleanText(draft.title, 250),
    family: draft.family,
    objective: cleanText(draft.objective),
    channels: [...new Set(draft.channels)],
    lang: draft.lang,
    persona: cleanText(draft.persona),
    steps,
    evidence: [...new Set(draft.evidence)],
    limits: cleanText(draft.limits),
  };
}
function createMission(
  state: AppState,
  scenario: Scenario,
  date: string,
  operator: string,
  actor: Actor,
  now: string,
  options?: CommandOptions,
): Mission {
  assert(scenario.status === 'validated', 'INVALID_STATE');
  const assigned = options?.operators?.find((entry) => entry.id === operator);
  assert(options?.operators ? assigned : OPERATORS.includes(operator), 'INVALID_INPUT');
  const mission: Mission = {
    id: id('m', options),
    scenarioId: scenario.id,
    scenarioSnapshot: structuredClone(scenario),
    criteriaVersion: CRITERIA_VERSION,
    baselineMissionId: null,
    date: isoDate(date),
    operator: assigned?.name || operator,
    ...(assigned ? { operatorId: assigned.id } : {}),
    status: 'todo',
    elapsed: 0,
    runningSince: null,
    steps: scenario.steps.map(() => ({ done: false, at: null, note: '' })),
    log: [],
    scores: {},
    comments: {},
    critical: false,
    validatedBy: null,
    validatedAt: null,
    reportSnapshot: null,
  };
  event(mission, now, `Mission planifiée par ${actor.name}`, `Mission scheduled by ${actor.name}`);
  state.missions.push(mission);
  return mission;
}
/** Canonical content precondition shared by the editor and server command boundary. */
export function scenarioFingerprint(scenario: Scenario): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  }
  return JSON.stringify(canonical(scenario));
}
export function createPublishedReport(state: AppState, mission: Mission): PublishedReport {
  const score = scoreOf(mission);
  assert(score !== null && mission.validatedBy && mission.validatedAt, 'INVALID_STATE');
  return structuredClone({
    missionId: mission.id,
    date: mission.date,
    operator: mission.operator,
    scenario: mission.scenarioSnapshot,
    criteriaVersion: mission.criteriaVersion,
    scores: mission.scores,
    comments: mission.comments,
    critical: mission.critical,
    score,
    level: levelOf(score, mission.critical)!,
    evidence: state.evidence.filter((entry) => entry.missionId === mission.id),
    actions: state.actions.filter((action) => action.missionId === mission.id),
    validatedBy: mission.validatedBy,
    validatedAt: mission.validatedAt,
  });
}

/** The single mutation boundary. Local actors are demonstrative; hosted adapters must authenticate them. */
export function applyCommand(
  input: AppState,
  command: Command,
  actor: Actor,
  options?: CommandOptions,
): CommandResult {
  assert(
    ['qualite', 'operateur', 'client'].includes(actor.role) &&
      typeof actor.name === 'string' &&
      actor.name.trim(),
    'FORBIDDEN',
  );
  const state = structuredClone(input);
  const now = new Date().toISOString();
  let entityId: string | undefined;
  switch (command.type) {
    case 'scenario.create': {
      quality(actor);
      const draft = validateScenarioDraft(state, command.draft);
      const scenario: Scenario = {
        ...draft,
        id: id('s', options),
        status: 'draft',
        parentId: null,
        createdAt: now,
      };
      state.scenarios.push(scenario);
      entityId = scenario.id;
      break;
    }
    case 'scenario.update': {
      quality(actor);
      const scenario = findScenario(state, command.id);
      assert(scenario.status === 'draft', 'INVALID_STATE');
      assert(scenarioFingerprint(scenario) === command.expectedFingerprint, 'SCENARIO_CONFLICT');
      assert(command.draft.clientId === scenario.clientId, 'FORBIDDEN');
      const draft = validateScenarioDraft(state, command.draft);
      Object.assign(scenario, draft);
      entityId = scenario.id;
      break;
    }
    case 'scenario.approve': {
      quality(actor);
      const scenario = findScenario(state, command.id);
      validateScenarioDraft(state, scenario);
      if (scenario.status !== 'validated') {
        scenario.status = 'validated';
        scenario.approvedBy = actor.name;
        scenario.approvedAt = now;
      }
      entityId = scenario.id;
      break;
    }
    case 'scenario.duplicate': {
      quality(actor);
      const original = findScenario(state, command.id);
      const scenario = structuredClone(original);
      scenario.id = id('s', options);
      scenario.parentId = original.parentId || original.id;
      const suffix = (title: string) => `${title.replace(/ · retest$/, '')} · retest`;
      scenario.title =
        typeof original.title === 'string'
          ? suffix(original.title)
          : { fr: suffix(original.title.fr), en: suffix(original.title.en) };
      scenario.status = 'draft';
      scenario.createdAt = now;
      delete scenario.approvedAt;
      delete scenario.approvedBy;
      state.scenarios.push(scenario);
      entityId = scenario.id;
      break;
    }
    case 'mission.create': {
      quality(actor);
      entityId = createMission(
        state,
        findScenario(state, command.scenarioId),
        command.date,
        command.operator,
        actor,
        now,
        options,
      ).id;
      break;
    }
    case 'mission.timer': {
      const mission = editableMission(state, command.id, actor);
      if (command.running) start(mission, now, actor);
      else pause(mission, now);
      entityId = mission.id;
      break;
    }
    case 'mission.step': {
      const mission = editableMission(state, command.id, actor);
      assert(
        Number.isInteger(command.index) &&
          command.index >= 0 &&
          command.index < mission.steps.length,
        'INVALID_INPUT',
      );
      const step = mission.steps[command.index];
      if (command.note !== undefined) {
        if (command.expectedNote !== undefined)
          assert(step.note === command.expectedNote, 'NOTE_CONFLICT');
        assert(typeof command.note === 'string' && command.note.length <= 10000, 'INVALID_INPUT');
        step.note = command.note;
      }
      if (command.done !== undefined && command.done !== step.done) {
        assert(typeof command.done === 'boolean', 'INVALID_INPUT');
        if (mission.status === 'todo') start(mission, now, actor);
        step.done = command.done;
        step.at = command.done ? now : null;
        event(
          mission,
          now,
          `Étape ${command.index + 1} ${step.done ? 'terminée' : 'rouverte'}`,
          `Step ${command.index + 1} ${step.done ? 'completed' : 'reopened'}`,
        );
      }
      entityId = mission.id;
      break;
    }
    case 'mission.submit': {
      const mission = editableMission(state, command.id, actor);
      assert(mission.status === 'doing', 'INVALID_STATE');
      assert(
        command.allowIncomplete || mission.steps.every((step) => step.done),
        'INCOMPLETE_STEPS',
      );
      pause(mission, now);
      mission.status = 'review';
      event(mission, now, 'Mission soumise à validation', 'Mission submitted for review');
      entityId = mission.id;
      break;
    }
    case 'evidence.add': {
      const mission = editableMission(state, command.missionId, actor);
      const payload = command.evidence;
      assert(textPresent(payload.label) || payload.fileId || payload.img, 'EVIDENCE_REQUIRED');
      assert(Object.hasOwn(EVTYPES, payload.type), 'INVALID_INPUT');
      if (payload.size !== undefined)
        assert(
          Number.isFinite(payload.size) && payload.size >= 0 && payload.size <= 10 * 1024 * 1024,
          'INVALID_FILE',
        );
      if (payload.img)
        assert(
          payload.img.length <= 14 * 1024 * 1024 &&
            /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(payload.img),
          'INVALID_FILE',
        );
      if (payload.fileId)
        assert(
          typeof payload.fileId === 'string' &&
            payload.fileId.length <= 200 &&
            Boolean(payload.fileId.trim()),
          'INVALID_FILE',
        );
      if (payload.file) {
        assert(
          Boolean(payload.fileId || payload.img) &&
            /\.(?:jpe?g|png|webp|gif|pdf|txt|eml)$/i.test(payload.file),
          'INVALID_FILE',
        );
      }
      if (payload.mimeType)
        assert(
          [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'application/pdf',
            'text/plain',
            'message/rfc822',
            'application/octet-stream', // Some browsers report .eml as generic binary; extension is checked above.
          ].includes(payload.mimeType),
          'INVALID_FILE',
        );
      const evidence = {
        id: id('e', options),
        missionId: mission.id,
        at: now,
        type: payload.type,
        label: cleanText(
          textPresent(payload.label) ? payload.label : payload.file || 'Preuve',
          500,
        ),
        text: cleanText(payload.text),
        file: payload.file || null,
        img: payload.img || null,
        ...(payload.fileId ? { fileId: payload.fileId } : {}),
        ...(payload.mimeType ? { mimeType: payload.mimeType } : {}),
        ...(payload.size !== undefined ? { size: payload.size } : {}),
      };
      state.evidence.push(evidence);
      if (mission.status === 'todo') start(mission, now, actor);
      event(mission, now, 'Preuve horodatée ajoutée', 'Timestamped evidence added');
      entityId = evidence.id;
      break;
    }
    case 'mission.score': {
      quality(actor);
      const mission = findMission(state, command.id);
      assert(mission.status === 'review', 'INVALID_STATE');
      if (command.draftActions !== undefined)
        assert(command.expectedScoringFingerprint !== undefined, 'SCORING_CONFLICT');
      checkScoringFingerprint(mission, command.expectedScoringFingerprint);
      setAssessment(mission, command.scores, command.comments, command.critical);
      if (command.draftActions !== undefined || mission.scoringDraft) {
        mission.scoringDraft = {
          revision: (mission.scoringDraft?.revision ?? 0) + 1,
          actions:
            command.draftActions === undefined
              ? mission.scoringDraft!.actions
              : cleanDraftActions(command.draftActions),
        };
      }
      entityId = mission.id;
      break;
    }
    case 'mission.approve': {
      quality(actor);
      const mission = findMission(state, command.id);
      entityId = mission.id;
      const hasAssessment =
        command.scores !== undefined ||
        command.comments !== undefined ||
        command.critical !== undefined;
      if (hasAssessment)
        assert(
          command.scores !== undefined &&
            command.comments !== undefined &&
            command.critical !== undefined,
          'INVALID_INPUT',
        );
      // Retrying an already completed approval cannot create another report or duplicate actions.
      if (mission.status === 'done' && mission.reportSnapshot) {
        const comparableAction = (action: ActionDraft) => ({
          critId: action.critId,
          horizon: action.horizon,
          text: cleanText(action.text),
          owner: cleanText(action.owner, 500),
        });
        assert(
          JSON.stringify(command.actions.map(comparableAction)) ===
            JSON.stringify(mission.reportSnapshot.actions.map(comparableAction)),
          'SCORING_CONFLICT',
        );
        if (hasAssessment) {
          const desired = structuredClone(mission);
          setAssessment(desired, command.scores!, command.comments!, command.critical!);
          assert(scoringFingerprint(desired) === scoringFingerprint(mission), 'SCORING_CONFLICT');
        } else checkScoringFingerprint(mission, command.expectedScoringFingerprint);
        break;
      }
      assert(mission.status === 'review', 'INVALID_STATE');
      checkScoringFingerprint(mission, command.expectedScoringFingerprint);
      if (hasAssessment)
        setAssessment(mission, command.scores!, command.comments!, command.critical!);
      assert(
        CRITERIA.every((criterion) => mission.scores[criterion.id] !== undefined),
        'UNRATED_CRITERIA',
      );
      assert(scoreOf(mission) !== null, 'NO_APPLICABLE_CRITERIA');
      assert(Array.isArray(command.actions) && command.actions.length <= 100, 'INVALID_INPUT');
      const actions: CorrectiveAction[] = command.actions.map((draft) => {
        assert(
          CRITERIA.some((criterion) => criterion.id === draft.critId) &&
            [7, 30, 90].includes(draft.horizon),
          'INVALID_INPUT',
        );
        assert(textPresent(draft.text), 'INVALID_INPUT');
        return {
          id: id('a', options),
          missionId: mission.id,
          critId: draft.critId,
          horizon: draft.horizon,
          text: cleanText(draft.text),
          owner: cleanText(draft.owner, 500),
          done: false,
          dueAt: addDays(now, draft.horizon),
          completedAt: null,
          completedBy: null,
        };
      });
      state.actions.push(...actions);
      delete mission.scoringDraft;
      mission.status = 'done';
      mission.validatedBy = actor.name;
      mission.validatedAt = now;
      event(
        mission,
        now,
        `Notation validée par ${actor.name}`,
        `Scoring approved by ${actor.name}`,
      );
      mission.reportSnapshot = createPublishedReport(state, mission);
      break;
    }
    case 'mission.retest': {
      quality(actor);
      const baseline = findMission(state, command.id);
      assert(baseline.status === 'done' && baseline.reportSnapshot, 'INVALID_STATE');
      const scenario = structuredClone(baseline.scenarioSnapshot);
      scenario.id = id('s', options);
      scenario.parentId = baseline.scenarioSnapshot.parentId || baseline.scenarioSnapshot.id;
      const suffix = (title: string) => `${title.replace(/ · retest$/, '')} · retest`;
      scenario.title =
        typeof scenario.title === 'string'
          ? suffix(scenario.title)
          : { fr: suffix(scenario.title.fr), en: suffix(scenario.title.en) };
      scenario.createdAt = now;
      scenario.approvedAt = now;
      scenario.approvedBy = actor.name;
      state.scenarios.push(scenario);
      const mission = createMission(
        state,
        scenario,
        addDays(now, 30),
        baseline.operatorId || baseline.operator,
        actor,
        now,
        options,
      );
      mission.baselineMissionId = baseline.id;
      mission.criteriaVersion = baseline.criteriaVersion;
      event(
        mission,
        now,
        `Retest de la mission ${baseline.id}`,
        `Retest of mission ${baseline.id}`,
      );
      entityId = mission.id;
      break;
    }
    case 'action.toggle': {
      const action = state.actions.find((entry) => entry.id === command.id);
      assert(action, 'NOT_FOUND');
      const mission = findMission(state, action.missionId);
      assert(actor.role !== 'operateur' && canAccessMission(state, mission, actor), 'FORBIDDEN');
      assert(typeof command.done === 'boolean', 'INVALID_INPUT');
      if (action.done !== command.done) {
        action.done = command.done;
        action.completedAt = command.done ? now : null;
        action.completedBy = command.done ? actor.name : null;
      }
      entityId = action.id;
      break;
    }
    default: {
      throw new DomainError('INVALID_INPUT');
    }
  }
  return { state, ...(entityId ? { entityId } : {}) };
}
