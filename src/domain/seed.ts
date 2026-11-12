import type { AppState, Client, Scenario, Mission, Evidence, CorrectiveAction } from './types';
import { CRITERIA_VERSION } from './reference';
import { createPublishedReport } from './commands';

type SeedData = {
  clients: Client[];
  scenarios: Scenario[];
  missions: Omit<
    Mission,
    'scenarioSnapshot' | 'criteriaVersion' | 'baselineMissionId' | 'reportSnapshot'
  >[];
  evidence: Evidence[];
  actions: Omit<CorrectiveAction, 'dueAt' | 'completedAt' | 'completedBy'>[];
};

const RAW_SEED: SeedData = {
  clients: [
    {
      id: 'c1',
      name: 'Hôtels Les Tilleuls',
      sites: 12,
    },
    {
      id: 'c2',
      name: 'Centre médical Arcadie',
      sites: 3,
    },
    {
      id: 'c3',
      name: 'AutoNord Distribution',
      sites: 8,
    },
  ],
  scenarios: [
    {
      id: 's1',
      clientId: 'c1',
      title: {
        fr: 'Demande de séminaire en anglais',
        en: 'Seminar enquiry in English',
      },
      family: 'lang',
      objective: {
        fr: 'Mesurer comment un prospect anglophone est accueilli, orienté et relancé pour une demande de groupe.',
        en: 'Measure how an English-speaking prospect is greeted, routed and followed up on a group request.',
      },
      channels: ['form', 'email', 'phone'],
      lang: 'EN',
      persona: {
        fr: 'Sarah Collins, organisatrice d’événements à Londres, 25 personnes, 2 nuits en mars.',
        en: 'Sarah Collins, event organiser in London, 25 people, 2 nights in March.',
      },
      steps: [
        {
          label: {
            fr: 'Envoyer le formulaire de contact en anglais (séminaire, 25 personnes)',
            en: 'Send the contact form in English (seminar, 25 people)',
          },
          seuil: {
            fr: 'Accusé de réception en moins de 5 min',
            en: 'Acknowledgement in under 5 min',
          },
        },
        {
          label: {
            fr: 'Attendre la première réponse écrite',
            en: 'Wait for the first written reply',
          },
          seuil: {
            fr: 'Moins de 4 h ouvrées',
            en: 'Under 4 business hours',
          },
        },
        {
          label: {
            fr: 'Appeler le standard et demander un interlocuteur anglophone',
            en: 'Call the switchboard and ask for an English-speaking contact',
          },
          seuil: {
            fr: 'Décroché en moins de 4 sonneries, transfert annoncé',
            en: 'Answered within 4 rings, transfer announced',
          },
        },
        {
          label: {
            fr: 'Demander le tarif groupe et les conditions d’annulation',
            en: 'Ask for the group rate and cancellation terms',
          },
          seuil: {
            fr: 'Prix et conditions donnés clairement',
            en: 'Price and terms stated clearly',
          },
        },
        {
          label: {
            fr: 'Comparer les réponses obtenues par email et par téléphone',
            en: 'Compare the answers given by email and by phone',
          },
          seuil: {
            fr: 'Même prix, mêmes conditions',
            en: 'Same price, same terms',
          },
        },
      ],
      evidence: ['formcap', 'emails', 'calls', 'callnotes'],
      limits: {
        fr: 'Aucune réservation ni option réelle. Aucune donnée bancaire. Arrêt si l’établissement propose de bloquer des chambres.',
        en: 'No real booking or option. No card details. Stop if the hotel offers to hold rooms.',
      },
      status: 'validated',
      parentId: null,
      createdAt: '2026-07-01T09:00:00Z',
    },
    {
      id: 's2',
      clientId: 'c1',
      title: {
        fr: 'Demande de séminaire en anglais · retest',
        en: 'Seminar enquiry in English · retest',
      },
      family: 'lang',
      objective: {
        fr: 'Rejouer le parcours après corrections pour mesurer l’amélioration.',
        en: 'Rerun the journey after the fixes to measure the improvement.',
      },
      channels: ['form', 'email', 'phone'],
      lang: 'EN',
      persona: {
        fr: 'Sarah Collins, organisatrice d’événements à Londres, 25 personnes, 2 nuits en mars.',
        en: 'Sarah Collins, event organiser in London, 25 people, 2 nights in March.',
      },
      steps: [
        {
          label: {
            fr: 'Envoyer le formulaire de contact en anglais (séminaire, 25 personnes)',
            en: 'Send the contact form in English (seminar, 25 people)',
          },
          seuil: {
            fr: 'Accusé de réception en moins de 5 min',
            en: 'Acknowledgement in under 5 min',
          },
        },
        {
          label: {
            fr: 'Attendre la première réponse écrite',
            en: 'Wait for the first written reply',
          },
          seuil: {
            fr: 'Moins de 4 h ouvrées',
            en: 'Under 4 business hours',
          },
        },
        {
          label: {
            fr: 'Appeler le standard et demander un interlocuteur anglophone',
            en: 'Call the switchboard and ask for an English-speaking contact',
          },
          seuil: {
            fr: 'Décroché en moins de 4 sonneries, transfert annoncé',
            en: 'Answered within 4 rings, transfer announced',
          },
        },
        {
          label: {
            fr: 'Demander le tarif groupe et les conditions d’annulation',
            en: 'Ask for the group rate and cancellation terms',
          },
          seuil: {
            fr: 'Prix et conditions donnés clairement',
            en: 'Price and terms stated clearly',
          },
        },
        {
          label: {
            fr: 'Comparer les réponses obtenues par email et par téléphone',
            en: 'Compare the answers given by email and by phone',
          },
          seuil: {
            fr: 'Même prix, mêmes conditions',
            en: 'Same price, same terms',
          },
        },
      ],
      evidence: ['formcap', 'emails', 'calls', 'callnotes'],
      limits: {
        fr: 'Aucune réservation ni option réelle. Aucune donnée bancaire. Arrêt si l’établissement propose de bloquer des chambres.',
        en: 'No real booking or option. No card details. Stop if the hotel offers to hold rooms.',
      },
      status: 'validated',
      parentId: 's1',
      createdAt: '2026-10-01T09:00:00Z',
    },
    {
      id: 's3',
      clientId: 'c2',
      title: {
        fr: 'Prise de rendez-vous et orientation patient',
        en: 'Appointment booking and patient guidance',
      },
      family: 'info',
      objective: {
        fr: 'Vérifier qu’un patient obtient un créneau, les bonnes informations et une confirmation écrite.',
        en: 'Check that a patient gets a slot, the right information and a written confirmation.',
      },
      channels: ['chat', 'phone'],
      lang: 'FR',
      persona: {
        fr: 'Mme Durand, 64 ans, cherche un rendez-vous en cardiologie sous 15 jours.',
        en: 'Mrs Durand, 64, needs a cardiology appointment within 15 days.',
      },
      steps: [
        {
          label: {
            fr: 'Poser la question sur le chat du site',
            en: 'Ask the question on the website chat',
          },
          seuil: {
            fr: 'Réponse en moins de 10 min aux heures d’ouverture',
            en: 'Reply in under 10 min during opening hours',
          },
        },
        {
          label: {
            fr: 'Appeler l’accueil et demander le premier créneau en cardiologie',
            en: 'Call reception and ask for the first cardiology slot',
          },
          seuil: {
            fr: 'Décroché en moins de 1 min',
            en: 'Answered in under 1 min',
          },
        },
        {
          label: {
            fr: 'Demander les documents à apporter',
            en: 'Ask which documents to bring',
          },
          seuil: {
            fr: 'Liste claire et complète',
            en: 'Clear and complete list',
          },
        },
        {
          label: {
            fr: 'Vérifier la confirmation écrite',
            en: 'Check the written confirmation',
          },
          seuil: {
            fr: 'SMS ou email reçu en moins de 1 h',
            en: 'Text or email received within 1 h',
          },
        },
      ],
      evidence: ['chatcap', 'calls', 'callnotes'],
      limits: {
        fr: 'Ne jamais occuper un vrai créneau : annuler dans l’heure si un rendez-vous est donné. Aucune donnée de santé réelle.',
        en: 'Never hold a real slot: cancel within the hour if an appointment is given. No real health data.',
      },
      status: 'validated',
      parentId: null,
      createdAt: '2026-08-01T09:00:00Z',
    },
    {
      id: 's4',
      clientId: 'c3',
      title: {
        fr: 'Demande d’essai et estimation de reprise',
        en: 'Test-drive request and trade-in estimate',
      },
      family: 'devis',
      objective: {
        fr: 'Mesurer la transmission d’une demande d’essai, la vitesse de rappel et la qualité de qualification.',
        en: 'Measure how a test-drive request is passed on, how fast the callback comes and how well the lead is qualified.',
      },
      channels: ['form', 'whatsapp', 'phone'],
      lang: 'FR',
      persona: {
        fr: 'Thomas Leroy, cadre, veut essayer un SUV hybride et faire reprendre une berline de 2019.',
        en: 'Thomas Leroy, a manager, wants to test a hybrid SUV and trade in a 2019 saloon.',
      },
      steps: [
        {
          label: {
            fr: 'Remplir le formulaire de demande d’essai',
            en: 'Fill in the test-drive request form',
          },
          seuil: {
            fr: 'Accusé de réception en moins de 5 min',
            en: 'Acknowledgement in under 5 min',
          },
        },
        {
          label: {
            fr: 'Attendre le rappel commercial',
            en: 'Wait for the sales callback',
          },
          seuil: {
            fr: 'Moins de 4 h ouvrées',
            en: 'Under 4 business hours',
          },
        },
        {
          label: {
            fr: 'Relancer par WhatsApp',
            en: 'Follow up on WhatsApp',
          },
          seuil: {
            fr: 'Réponse en moins de 2 h',
            en: 'Reply in under 2 h',
          },
        },
        {
          label: {
            fr: 'Demander une estimation de reprise',
            en: 'Ask for a trade-in estimate',
          },
          seuil: {
            fr: 'Questions de qualification posées',
            en: 'Qualifying questions asked',
          },
        },
        {
          label: {
            fr: 'Noter la proposition de rendez-vous',
            en: 'Note the appointment offered',
          },
          seuil: {
            fr: 'Date et heure proposées',
            en: 'Date and time offered',
          },
        },
      ],
      evidence: ['formcap', 'wacap', 'calls'],
      limits: {
        fr: 'Ne pas signer de bon de commande. Ne pas transmettre de vraie carte grise.',
        en: 'Do not sign an order form. Do not share a real registration document.',
      },
      status: 'validated',
      parentId: null,
      createdAt: '2026-10-01T09:00:00Z',
    },
    {
      id: 's5',
      clientId: 'c2',
      title: {
        fr: 'Demande d’annulation d’un rendez-vous',
        en: 'Appointment cancellation request',
      },
      family: 'annul',
      objective: {
        fr: 'Vérifier la clarté des conditions d’annulation et le délai de confirmation.',
        en: 'Check how clear the cancellation terms are and how fast the confirmation arrives.',
      },
      channels: ['phone', 'email'],
      lang: 'FR',
      persona: {
        fr: 'M. Benali annule un rendez-vous de radiologie pris la veille.',
        en: 'Mr Benali cancels a radiology appointment booked the day before.',
      },
      steps: [
        {
          label: {
            fr: 'Appeler pour annuler le rendez-vous',
            en: 'Call to cancel the appointment',
          },
          seuil: {
            fr: 'Annulation acceptée sans friction',
            en: 'Cancellation accepted without friction',
          },
        },
        {
          label: {
            fr: 'Demander une confirmation écrite',
            en: 'Ask for written confirmation',
          },
          seuil: {
            fr: 'Email reçu en moins de 24 h',
            en: 'Email received within 24 h',
          },
        },
      ],
      evidence: ['calls', 'emails'],
      limits: {
        fr: 'Utiliser uniquement un rendez-vous créé pour le test.',
        en: 'Only use an appointment created for the test.',
      },
      status: 'draft',
      parentId: null,
      createdAt: '2026-10-30T09:00:00Z',
    },
  ],
  missions: [
    {
      operator: 'Inès B.',
      status: 'done',
      elapsed: 15300000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-07-08T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-07-08T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-07-08T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-07-08T12:13:03Z',
          note: '',
        },
        {
          done: true,
          at: '2026-07-08T13:14:04Z',
          note: '',
        },
      ],
      log: [
        {
          at: '2026-07-08T09:10:00Z',
          text: {
            fr: 'Mission démarrée',
            en: 'Mission started',
          },
        },
        {
          at: '2026-07-10T12:30:00Z',
          text: {
            fr: 'Mission soumise à validation',
            en: 'Mission submitted for review',
          },
        },
      ],
      scores: {
        dispo: 3,
        vitesse: 1,
        compr: 2,
        commercial: 1,
        omni: 1,
        lang: 2,
        sensible: 2,
        suivi: 1,
      },
      comments: {
        vitesse: {
          fr: 'Première réponse au formulaire après 51 h, hors seuil de 4 h ouvrées.',
          en: 'First reply to the form after 51 h, beyond the 4 business-hour threshold.',
        },
        lang: {
          fr: 'Standard : « no English, sorry », appel transféré puis coupé après 3 min 40.',
          en: 'Switchboard: “no English, sorry”; call transferred then cut off after 3 min 40.',
        },
        omni: {
          fr: 'Tarif groupe : 128 € par email, 145 € au téléphone.',
          en: 'Group rate: €128 by email, €145 by phone.',
        },
        commercial: {
          fr: 'Aucune proposition de rendez-vous ni de relance.',
          en: 'No appointment offered and no follow-up.',
        },
        suivi: {
          fr: 'Aucune relance après l’email resté sans réponse.',
          en: 'No follow-up after the unanswered email.',
        },
        compr: {
          fr: 'Le nombre de participants n’a pas été redemandé.',
          en: 'The number of attendees was never confirmed.',
        },
        sensible: {
          fr: 'Conditions d’annulation données de façon vague.',
          en: 'Cancellation terms given vaguely.',
        },
      },
      critical: false,
      validatedBy: 'Nadia R.',
      validatedAt: '2026-07-10T15:00:00Z',
      id: 'm1',
      scenarioId: 's1',
      date: '2026-07-08T09:00:00Z',
    },
    {
      operator: 'Lucie M.',
      status: 'done',
      elapsed: 13800000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-09-10T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-10T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-10T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-10T12:13:03Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-10T13:14:04Z',
          note: '',
        },
      ],
      log: [],
      scores: {
        dispo: 3,
        vitesse: 2,
        compr: 3,
        commercial: 2,
        omni: 2,
        lang: 2,
        sensible: 3,
        suivi: 2,
      },
      comments: {
        vitesse: {
          fr: 'Réponse en 9 h, encore au-dessus du seuil.',
          en: 'Reply after 9 h, still above the threshold.',
        },
        lang: {
          fr: 'Interlocuteur anglophone disponible uniquement le matin.',
          en: 'English-speaking contact only available in the morning.',
        },
        omni: {
          fr: 'Écart de 6 € entre email et téléphone.',
          en: '€6 difference between email and phone.',
        },
        commercial: {
          fr: 'Rendez-vous proposé, mais sans relance.',
          en: 'Appointment offered, but no follow-up.',
        },
      },
      critical: false,
      validatedBy: 'Nadia R.',
      validatedAt: '2026-09-11T15:00:00Z',
      id: 'm9',
      scenarioId: 's1',
      date: '2026-09-10T09:00:00Z',
    },
    {
      operator: 'Inès B.',
      status: 'done',
      elapsed: 12600000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-10-14T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-14T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-14T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-14T12:13:03Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-14T13:14:04Z',
          note: '',
        },
      ],
      log: [],
      scores: {
        dispo: 4,
        vitesse: 3,
        compr: 3,
        commercial: 3,
        omni: 3,
        lang: 3,
        sensible: 3,
        suivi: 2,
      },
      comments: {
        suivi: {
          fr: 'Relance faite à J+4 au lieu de J+3.',
          en: 'Follow-up on D+4 instead of D+3.',
        },
        vitesse: {
          fr: 'Première réponse en anglais en 2 h 15.',
          en: 'First reply in English after 2 h 15.',
        },
      },
      critical: false,
      validatedBy: 'Nadia R.',
      validatedAt: '2026-10-15T15:00:00Z',
      id: 'm2',
      scenarioId: 's2',
      date: '2026-10-14T09:00:00Z',
    },
    {
      operator: 'Karim D.',
      status: 'done',
      elapsed: 9000000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-08-20T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-08-20T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-08-20T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-08-20T12:13:03Z',
          note: '',
        },
      ],
      log: [],
      scores: {
        dispo: 3,
        vitesse: 2,
        compr: 2,
        commercial: 2,
        omni: 3,
        lang: null,
        sensible: 2,
        suivi: 1,
      },
      comments: {
        vitesse: {
          fr: 'Chat sans réponse pendant 34 min.',
          en: 'Chat unanswered for 34 min.',
        },
        compr: {
          fr: 'Documents à apporter non précisés.',
          en: 'Documents to bring not specified.',
        },
        suivi: {
          fr: 'Aucune confirmation écrite reçue.',
          en: 'No written confirmation received.',
        },
      },
      critical: false,
      validatedBy: 'Nadia R.',
      validatedAt: '2026-08-21T15:00:00Z',
      id: 'm8',
      scenarioId: 's3',
      date: '2026-08-20T09:00:00Z',
    },
    {
      operator: 'Karim D.',
      status: 'done',
      elapsed: 8400000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-09-24T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-24T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-24T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-09-24T12:13:03Z',
          note: '',
        },
      ],
      log: [],
      scores: {
        dispo: 4,
        vitesse: 3,
        compr: 3,
        commercial: 2,
        omni: 3,
        lang: null,
        sensible: 3,
        suivi: 2,
      },
      comments: {
        commercial: {
          fr: 'Créneau proposé à 5 semaines sans alternative sur un autre site.',
          en: 'Slot offered 5 weeks out with no alternative at another site.',
        },
        suivi: {
          fr: 'Confirmation SMS reçue après 3 h.',
          en: 'Text confirmation received after 3 h.',
        },
      },
      critical: false,
      validatedBy: 'Nadia R.',
      validatedAt: '2026-09-25T15:00:00Z',
      id: 'm3',
      scenarioId: 's3',
      date: '2026-09-24T09:00:00Z',
    },
    {
      operator: 'Yanis T.',
      status: 'done',
      elapsed: 16200000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-10-21T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-21T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-21T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-21T12:13:03Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-21T13:14:04Z',
          note: '',
        },
      ],
      log: [],
      scores: {
        dispo: 2,
        vitesse: 1,
        compr: 2,
        commercial: 1,
        omni: 2,
        lang: null,
        sensible: 2,
        suivi: 1,
      },
      comments: {
        dispo: {
          fr: 'Le formulaire d’essai renvoie une page blanche sur mobile.',
          en: 'The test-drive form returns a blank page on mobile.',
        },
        vitesse: {
          fr: 'Rappel commercial après 3 jours ouvrés.',
          en: 'Sales callback after 3 business days.',
        },
        commercial: {
          fr: 'Aucun rendez-vous d’essai proposé.',
          en: 'No test-drive appointment offered.',
        },
        compr: {
          fr: 'Reprise évoquée sans aucune question sur le véhicule.',
          en: 'Trade-in mentioned without a single question about the car.',
        },
        suivi: {
          fr: 'Message WhatsApp lu, sans réponse.',
          en: 'WhatsApp message read, no reply.',
        },
      },
      critical: false,
      validatedBy: 'Nadia R.',
      validatedAt: '2026-10-22T15:00:00Z',
      id: 'm4',
      scenarioId: 's4',
      date: '2026-10-21T09:00:00Z',
    },
    {
      operator: 'Karim D.',
      status: 'review',
      elapsed: 7900000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-10-28T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-28T10:11:01Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-28T11:12:02Z',
          note: '',
        },
        {
          done: true,
          at: '2026-10-28T12:13:03Z',
          note: '',
        },
      ],
      log: [
        {
          at: '2026-10-28T09:02:11Z',
          text: {
            fr: 'Mission démarrée',
            en: 'Mission started',
          },
        },
        {
          at: '2026-10-28T09:05:40Z',
          text: {
            fr: 'Étape 1 terminée',
            en: 'Step 1 done',
          },
        },
        {
          at: '2026-10-28T11:14:02Z',
          text: {
            fr: 'Mission soumise à validation',
            en: 'Mission submitted for review',
          },
        },
      ],
      scores: {},
      comments: {},
      critical: false,
      validatedBy: null,
      validatedAt: null,
      id: 'm7',
      scenarioId: 's3',
      date: '2026-10-28T09:00:00Z',
    },
    {
      operator: 'Inès B.',
      status: 'doing',
      elapsed: 4320000,
      runningSince: null,
      steps: [
        {
          done: true,
          at: '2026-11-03T09:10:00Z',
          note: '',
        },
        {
          done: true,
          at: '2026-11-03T10:11:01Z',
          note: '',
        },
        {
          done: false,
          at: null,
          note: '',
        },
        {
          done: false,
          at: null,
          note: '',
        },
        {
          done: false,
          at: null,
          note: '',
        },
      ],
      log: [
        {
          at: '2026-11-03T08:31:05Z',
          text: {
            fr: 'Mission démarrée',
            en: 'Mission started',
          },
        },
        {
          at: '2026-11-03T09:10:10Z',
          text: {
            fr: 'Étape 1 terminée',
            en: 'Step 1 done',
          },
        },
        {
          at: '2026-11-03T09:11:11Z',
          text: {
            fr: 'Étape 2 terminée',
            en: 'Step 2 done',
          },
        },
        {
          at: '2026-11-03T09:40:00Z',
          text: {
            fr: 'Chronomètre en pause',
            en: 'Timer paused',
          },
        },
      ],
      scores: {},
      comments: {},
      critical: false,
      validatedBy: null,
      validatedAt: null,
      id: 'm5',
      scenarioId: 's4',
      date: '2026-11-03T08:30:00Z',
    },
    {
      operator: 'Lucie M.',
      status: 'todo',
      elapsed: 0,
      runningSince: null,
      steps: [
        {
          done: false,
          at: null,
          note: '',
        },
        {
          done: false,
          at: null,
          note: '',
        },
        {
          done: false,
          at: null,
          note: '',
        },
        {
          done: false,
          at: null,
          note: '',
        },
      ],
      log: [],
      scores: {},
      comments: {},
      critical: false,
      validatedBy: null,
      validatedAt: null,
      id: 'm6',
      scenarioId: 's3',
      date: '2026-11-05T09:00:00Z',
    },
  ],
  evidence: [
    {
      id: 'e1',
      missionId: 'm1',
      type: 'capture',
      at: '2026-07-08T09:12:04Z',
      label: {
        fr: 'Formulaire de contact envoyé en anglais',
        en: 'Contact form sent in English',
      },
      text: {
        fr: 'Formulaire « Contact us » rempli : séminaire, 25 participants, 2 nuits.',
        en: '“Contact us” form filled in: seminar, 25 attendees, 2 nights.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e2',
      missionId: 'm1',
      type: 'email',
      at: '2026-07-08T09:12:31Z',
      label: {
        fr: 'Accusé de réception automatique, en français uniquement',
        en: 'Automatic acknowledgement, in French only',
      },
      text: {
        fr: '« Merci pour votre message, nous revenons vers vous rapidement. »',
        en: '“Merci pour votre message, nous revenons vers vous rapidement.”',
      },
      img: null,
      file: null,
    },
    {
      id: 'e3',
      missionId: 'm1',
      type: 'appel',
      at: '2026-07-08T10:05:12Z',
      label: {
        fr: 'Appel au standard : transfert puis coupure',
        en: 'Switchboard call: transferred then cut off',
      },
      text: {
        fr: 'Durée 3 min 40. Aucun interlocuteur anglophone. Pas de rappel proposé.',
        en: 'Duration 3 min 40. No English speaker. No callback offered.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e4',
      missionId: 'm1',
      type: 'email',
      at: '2026-07-10T12:20:00Z',
      label: {
        fr: 'Réponse commerciale reçue à J+2',
        en: 'Sales reply received on D+2',
      },
      text: {
        fr: 'Tarif groupe : 128 € par nuit. Conditions d’annulation non précisées.',
        en: 'Group rate: €128 per night. Cancellation terms not stated.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e5',
      missionId: 'm2',
      type: 'email',
      at: '2026-10-14T11:27:00Z',
      label: {
        fr: 'Réponse en anglais en 2 h 15',
        en: 'Reply in English within 2 h 15',
      },
      text: {
        fr: 'Proposition chiffrée à 132 €, conditions d’annulation jointes.',
        en: 'Priced proposal at €132, cancellation terms attached.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e6',
      missionId: 'm2',
      type: 'appel',
      at: '2026-10-14T14:02:00Z',
      label: {
        fr: 'Transfert annoncé vers la responsable groupes',
        en: 'Transfer announced to the group sales manager',
      },
      text: {
        fr: 'Interlocutrice anglophone, même tarif que par email.',
        en: 'English-speaking contact, same rate as by email.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e7',
      missionId: 'm4',
      type: 'capture',
      at: '2026-10-21T09:08:45Z',
      label: {
        fr: 'Page blanche après envoi du formulaire (mobile)',
        en: 'Blank page after sending the form (mobile)',
      },
      text: {
        fr: 'iPhone, Safari. Aucun message de confirmation.',
        en: 'iPhone, Safari. No confirmation message.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e8',
      missionId: 'm4',
      type: 'capture',
      at: '2026-10-22T10:15:00Z',
      label: {
        fr: 'Message WhatsApp lu sans réponse',
        en: 'WhatsApp message read, no reply',
      },
      text: {
        fr: 'Double coche bleue à 10 h 15, aucune réponse à 18 h.',
        en: 'Blue ticks at 10:15, still no reply at 18:00.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e9',
      missionId: 'm7',
      type: 'capture',
      at: '2026-10-28T09:11:30Z',
      label: {
        fr: 'Chat : réponse en 6 min',
        en: 'Chat: reply within 6 min',
      },
      text: {
        fr: 'Conseillère : premier créneau le 18 novembre.',
        en: 'Agent: first slot on 18 November.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e10',
      missionId: 'm7',
      type: 'appel',
      at: '2026-10-28T09:40:02Z',
      label: {
        fr: 'Accueil : décroché en 40 s',
        en: 'Reception: answered within 40 s',
      },
      text: {
        fr: 'Créneau identique à celui du chat. Liste des documents donnée oralement.',
        en: 'Same slot as on the chat. Document list given verbally.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e11',
      missionId: 'm7',
      type: 'note',
      at: '2026-10-28T10:05:00Z',
      label: {
        fr: 'Confirmation SMS reçue en 25 min',
        en: 'Text confirmation received within 25 min',
      },
      text: {
        fr: 'SMS clair avec adresse et documents à apporter.',
        en: 'Clear text with the address and documents to bring.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e12',
      missionId: 'm3',
      type: 'capture',
      at: '2026-09-24T09:30:00Z',
      label: {
        fr: 'Créneau proposé à 5 semaines',
        en: 'Slot offered 5 weeks out',
      },
      text: {
        fr: 'Pas d’alternative sur le site de Courbevoie.',
        en: 'No alternative offered at the Courbevoie site.',
      },
      img: null,
      file: null,
    },
    {
      id: 'e13',
      missionId: 'm5',
      type: 'capture',
      at: '2026-11-03T08:41:00Z',
      label: {
        fr: 'Formulaire d’essai envoyé (desktop)',
        en: 'Test-drive form sent (desktop)',
      },
      text: {
        fr: 'Accusé de réception reçu en 2 min.',
        en: 'Acknowledgement received within 2 min.',
      },
      img: null,
      file: null,
    },
  ],
  actions: [
    {
      id: 'a1',
      missionId: 'm1',
      critId: 'lang',
      horizon: 7,
      done: true,
      text: {
        fr: 'Activer une réponse automatique en anglais qui annonce le délai de rappel',
        en: 'Enable an English auto-reply that states the callback time',
      },
      owner: {
        fr: 'Réception · Hôtel Opéra',
        en: 'Front desk · Hôtel Opéra',
      },
    },
    {
      id: 'a2',
      missionId: 'm1',
      critId: 'lang',
      horizon: 7,
      done: true,
      text: {
        fr: 'Script standard : transfert vers un interlocuteur anglophone identifié',
        en: 'Switchboard script: transfer to a named English-speaking contact',
      },
      owner: {
        fr: 'Chef de réception',
        en: 'Front office manager',
      },
    },
    {
      id: 'a3',
      missionId: 'm1',
      critId: 'omni',
      horizon: 30,
      done: true,
      text: {
        fr: 'Référentiel unique des tarifs groupe (email = téléphone)',
        en: 'Single group rate sheet (email = phone)',
      },
      owner: {
        fr: 'Revenue manager',
        en: 'Revenue manager',
      },
    },
    {
      id: 'a4',
      missionId: 'm1',
      critId: 'suivi',
      horizon: 30,
      done: false,
      text: {
        fr: 'Séquence de relance devis J+1 / J+3',
        en: 'Quote follow-up sequence D+1 / D+3',
      },
      owner: {
        fr: 'Service groupes',
        en: 'Group sales',
      },
    },
    {
      id: 'a5',
      missionId: 'm1',
      critId: 'lang',
      horizon: 90,
      done: false,
      text: {
        fr: 'Microformation « accueil d’un prospect étranger » (3 min)',
        en: 'Micro-training “welcoming a foreign prospect” (3 min)',
      },
      owner: {
        fr: 'RH formation',
        en: 'HR training',
      },
    },
    {
      id: 'a6',
      missionId: 'm4',
      critId: 'dispo',
      horizon: 7,
      done: false,
      text: {
        fr: 'Corriger l’envoi du formulaire d’essai sur mobile',
        en: 'Fix test-drive form submission on mobile',
      },
      owner: {
        fr: 'Agence web',
        en: 'Web agency',
      },
    },
    {
      id: 'a7',
      missionId: 'm4',
      critId: 'vitesse',
      horizon: 7,
      done: false,
      text: {
        fr: 'Alerte CRM sur demande d’essai non traitée sous 4 h',
        en: 'CRM alert on test-drive requests untouched after 4 h',
      },
      owner: {
        fr: 'Responsable commercial',
        en: 'Sales manager',
      },
    },
    {
      id: 'a8',
      missionId: 'm4',
      critId: 'compr',
      horizon: 30,
      done: false,
      text: {
        fr: 'Script de reprise : 5 questions de qualification',
        en: 'Trade-in script: 5 qualifying questions',
      },
      owner: {
        fr: 'Chef des ventes VO',
        en: 'Used-car sales lead',
      },
    },
    {
      id: 'a9',
      missionId: 'm3',
      critId: 'commercial',
      horizon: 30,
      done: false,
      text: {
        fr: 'Proposer systématiquement un créneau sur un autre site',
        en: 'Always offer a slot at another site',
      },
      owner: {
        fr: 'Coordinatrice accueil',
        en: 'Reception coordinator',
      },
    },
  ],
};

/** Explicit demo data, copied from the supplied prototype. Never real client records. */
export function createSeedState(): AppState {
  const data = structuredClone(RAW_SEED);
  const missions: Mission[] = data.missions.map((mission) => {
    const scenario = data.scenarios.find((item) => item.id === mission.scenarioId)!;
    return {
      ...mission,
      scenarioSnapshot: structuredClone(scenario),
      criteriaVersion: CRITERIA_VERSION,
      baselineMissionId: mission.id === 'm2' ? 'm1' : null,
      reportSnapshot: null,
    };
  });
  const actions: CorrectiveAction[] = data.actions.map((action) => {
    const mission = missions.find((item) => item.id === action.missionId)!;
    const due = new Date(mission.validatedAt || mission.date);
    due.setUTCDate(due.getUTCDate() + action.horizon);
    return {
      ...action,
      dueAt: due.toISOString(),
      completedAt: action.done ? '2026-10-01T12:00:00Z' : null,
      completedBy: action.done ? 'Équipe client' : null,
    };
  });
  const state: AppState = { version: 1, ...data, missions, actions };
  for (const mission of state.missions) {
    if (mission.status === 'done') mission.reportSnapshot = createPublishedReport(state, mission);
  }
  return state;
}
export const seed = createSeedState;
