export type Locale = 'fr' | 'en';
export type Localized = string | { fr: string; en: string };
export type Role = 'qualite' | 'operateur' | 'client';
export interface Actor {
  id?: string;
  role: Role;
  name: string;
  clientId?: string;
}
export type MissionStatus = 'todo' | 'doing' | 'review' | 'done';
export type Rating = 0 | 1 | 2 | 3 | 4 | null;
export type Level = 'ok' | 'warn' | 'bad' | 'crit';
export type Channel = 'form' | 'email' | 'phone' | 'whatsapp' | 'chat' | 'social';
export type EvidenceType = 'capture' | 'email' | 'appel' | 'note' | 'fichier';
export type ProspectLanguage = 'FR' | 'EN' | 'ES' | 'AR' | 'DE' | 'IT' | 'PT' | 'ZH';
export type FamilyId = 'info' | 'devis' | 'tel' | 'chat' | 'recl' | 'annul' | 'lang' | 'noresp';
export type CriterionId =
  'dispo' | 'vitesse' | 'compr' | 'commercial' | 'omni' | 'lang' | 'sensible' | 'suivi';
export type Scores = Partial<Record<CriterionId, Rating>>;
export type Comments = Partial<Record<CriterionId, Localized>>;
export interface Client {
  id: string;
  name: string;
  sites: number;
}
export interface ScenarioStep {
  label: Localized;
  seuil: Localized;
}
export interface ScenarioDraft {
  clientId: string;
  title: Localized;
  family: FamilyId;
  objective: Localized;
  channels: Channel[];
  lang: ProspectLanguage;
  persona: Localized;
  steps: ScenarioStep[];
  evidence: string[];
  limits: Localized;
}
export interface Scenario extends ScenarioDraft {
  id: string;
  status: 'draft' | 'validated';
  parentId: string | null;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}
export interface StepProgress {
  done: boolean;
  at: string | null;
  note: string;
}
export interface MissionEvent {
  at: string;
  text: Localized;
}
export interface Evidence {
  id: string;
  missionId: string;
  type: EvidenceType;
  at: string;
  label: Localized;
  text: Localized;
  img: string | null;
  file: string | null;
  fileId?: string;
  mimeType?: string;
  size?: number;
}
export interface ActionDraft {
  critId: CriterionId;
  horizon: 7 | 30 | 90;
  text: Localized;
  owner: Localized;
}
export interface ScoringActionDraft extends ActionDraft {
  include: boolean;
}
export interface CorrectiveAction extends ActionDraft {
  id: string;
  missionId: string;
  done: boolean;
  dueAt: string;
  completedAt: string | null;
  completedBy: string | null;
}
export interface PublishedReport {
  missionId: string;
  date: string;
  operator: string;
  scenario: Scenario;
  criteriaVersion: string;
  scores: Scores;
  comments: Comments;
  critical: boolean;
  score: number;
  level: Level;
  evidence: Evidence[];
  actions: CorrectiveAction[];
  validatedBy: string;
  validatedAt: string;
}
export interface Mission {
  id: string;
  scenarioId: string;
  scenarioSnapshot: Scenario;
  criteriaVersion: string;
  baselineMissionId: string | null;
  date: string;
  operator: string;
  operatorId?: string;
  status: MissionStatus;
  elapsed: number;
  runningSince: number | null;
  steps: StepProgress[];
  log: MissionEvent[];
  scores: Scores;
  comments: Comments;
  scoringDraft?: { revision: number; actions: ScoringActionDraft[] };
  critical: boolean;
  validatedBy: string | null;
  validatedAt: string | null;
  reportSnapshot: PublishedReport | null;
}
export interface AppState {
  version: 1;
  clients: Client[];
  scenarios: Scenario[];
  missions: Mission[];
  evidence: Evidence[];
  actions: CorrectiveAction[];
}
export type Command =
  | { type: 'scenario.create'; draft: ScenarioDraft }
  | { type: 'scenario.update'; id: string; draft: ScenarioDraft; expectedFingerprint: string }
  | { type: 'scenario.approve'; id: string }
  | { type: 'scenario.duplicate'; id: string }
  | { type: 'mission.create'; scenarioId: string; date: string; operator: string }
  | { type: 'mission.timer'; id: string; running: boolean }
  | {
      type: 'mission.step';
      id: string;
      index: number;
      done?: boolean;
      note?: string;
      expectedNote?: string;
    }
  | { type: 'mission.submit'; id: string; allowIncomplete?: boolean }
  | {
      type: 'evidence.add';
      missionId: string;
      evidence: {
        type: EvidenceType;
        label: Localized;
        text: Localized;
        file?: string | null;
        img?: string | null;
        fileId?: string;
        mimeType?: string;
        size?: number;
      };
    }
  | {
      type: 'mission.score';
      id: string;
      scores: Scores;
      comments: Comments;
      critical: boolean;
      draftActions?: ScoringActionDraft[];
      expectedScoringFingerprint?: string;
    }
  | {
      type: 'mission.approve';
      id: string;
      actions: ActionDraft[];
      scores?: Scores;
      comments?: Comments;
      critical?: boolean;
      expectedScoringFingerprint?: string;
    }
  | { type: 'mission.retest'; id: string }
  | { type: 'action.toggle'; id: string; done: boolean };
export interface Criterion {
  id: CriterionId;
  w: number;
  name: Localized;
  q: Localized;
  fix: Localized;
}
export interface Family {
  id: FamilyId;
  name: Localized;
  ex: Localized;
  ind: Localized;
  fix: Localized;
  tpl: Localized;
}
export type CommandResult = { state: AppState; entityId?: string };
