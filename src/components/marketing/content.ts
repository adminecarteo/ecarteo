export const methodSteps = [
  {
    number: '01',
    title: 'Cadrer',
    description: 'Définir les objectifs, les canaux, les horaires et les limites de la mission.',
    detail:
      'Le périmètre précise ce qui sera testé, les données utilisables et les situations à exclure.',
  },
  {
    number: '02',
    title: 'Écrire',
    description: 'Préparer un scénario, une identité de test et des critères de réussite.',
    detail:
      'Chaque étape décrit la demande à formuler, le résultat attendu et la preuve à recueillir.',
  },
  {
    number: '03',
    title: 'Exécuter',
    description: 'Rejouer le parcours comme un prospect, dans le cadre prévu.',
    detail:
      'L’opérateur suit les consignes et consigne les événements sans improviser hors périmètre.',
  },
  {
    number: '04',
    title: 'Documenter',
    description: 'Rassembler les observations, les échanges et les preuves horodatées.',
    detail:
      'Les pièces sont rattachées à la mission pour permettre une relecture précise du parcours.',
  },
  {
    number: '05',
    title: 'Noter',
    description: 'Appliquer une grille commune avant de commenter les résultats.',
    detail:
      'Les critères et leurs pondérations structurent la notation. Le responsable qualité valide l’interprétation.',
  },
  {
    number: '06',
    title: 'Analyser',
    description:
      'Distinguer l’incident isolé d’un problème de procédure, d’outil ou de compétence.',
    detail:
      'Les causes et les situations sensibles nécessitent un jugement humain, au-delà du score.',
  },
  {
    number: '07',
    title: 'Corriger',
    description: 'Donner à chaque action un responsable et un horizon à 7, 30 ou 90 jours.',
    detail:
      'Scripts, procédures et supports de formation transforment les constats en changements concrets.',
  },
  {
    number: '08',
    title: 'Retester',
    description: 'Rejouer un scénario comparable pour observer les progrès.',
    detail:
      'La comparaison porte sur le même parcours et la même grille, avec les preuves et les actions de l’audit de référence.',
  },
] as const;

export const offers = [
  {
    id: 'flash',
    name: 'Audit Flash',
    scope: 'Un parcours à comprendre',
    description:
      'Un premier audit pour identifier les frictions et décider des corrections prioritaires.',
    features: [
      'Un parcours, deux canaux, une langue',
      'Preuves, score et rapport de synthèse',
      'Cinq actions et une restitution',
    ],
  },
  {
    id: 'suivi',
    name: 'Suivi continu',
    scope: 'Des progrès à suivre',
    description:
      'Des scénarios récurrents pour suivre la qualité de service et vérifier l’effet des actions.',
    features: [
      'Audits mensuels selon le périmètre',
      'Suivi des actions et rapports comparables',
      'Retests et bibliothèque corrective',
    ],
  },
  {
    id: 'reseaux',
    name: 'Réseaux & international',
    scope: 'Plusieurs sites, plusieurs langues',
    description:
      'Un cadre commun pour examiner les écarts entre établissements, canaux et langues.',
    features: [
      'Échantillonnage adapté au réseau',
      'Parcours dans plusieurs langues',
      'Plans d’actions par établissement',
    ],
  },
] as const;

const englishMethodSteps = [
  {
    number: '01',
    title: 'Define',
    description: 'Set the objectives, channels, schedule and boundaries of the audit.',
    detail:
      'The scope states what will be tested, which data may be used and which situations are excluded.',
  },
  {
    number: '02',
    title: 'Write',
    description: 'Prepare a scenario, a test identity and clear success criteria.',
    detail: 'Each step describes the request, the expected result and the evidence to collect.',
  },
  {
    number: '03',
    title: 'Execute',
    description: 'Follow the journey as a prospective customer within the agreed scope.',
    detail:
      'The operator follows the instructions and records events without going beyond the approved boundaries.',
  },
  {
    number: '04',
    title: 'Document',
    description: 'Bring together observations, conversations and timestamped evidence.',
    detail: 'Evidence is linked to the audit so the journey can be reviewed accurately.',
  },
  {
    number: '05',
    title: 'Score',
    description: 'Apply a shared scoring framework before interpreting the results.',
    detail:
      'Criteria and their weights structure the assessment. The quality lead validates the interpretation.',
  },
  {
    number: '06',
    title: 'Analyse',
    description: 'Distinguish an isolated incident from a process, tool or skills problem.',
    detail: 'Causes and sensitive situations require human judgement beyond the score.',
  },
  {
    number: '07',
    title: 'Improve',
    description: 'Assign each action an owner and a 7, 30 or 90-day deadline.',
    detail: 'Scripts, procedures and training materials turn findings into practical changes.',
  },
  {
    number: '08',
    title: 'Retest',
    description: 'Repeat a comparable scenario to measure progress.',
    detail:
      'The comparison uses the same journey and scoring framework, with the evidence and actions from the baseline audit.',
  },
] as const;

const englishOffers = [
  {
    id: 'flash',
    name: 'Flash audit',
    scope: 'Understand one customer journey',
    description:
      'An initial audit to identify friction and decide which improvements matter first.',
    features: [
      'One journey, two channels, one language',
      'Evidence, score and summary report',
      'Five actions and a review session',
    ],
  },
  {
    id: 'suivi',
    name: 'Continuous monitoring',
    scope: 'Track improvements over time',
    description:
      'Recurring scenarios to monitor service quality and verify the effect of your actions.',
    features: [
      'Monthly audits within the agreed scope',
      'Action tracking and comparable reports',
      'Retests and an improvement library',
    ],
  },
  {
    id: 'reseaux',
    name: 'Networks & international',
    scope: 'Multiple sites, multiple languages',
    description:
      'A shared framework for examining differences between locations, channels and languages.',
    features: [
      'Sampling tailored to your network',
      'Customer journeys in several languages',
      'Action plans for each location',
    ],
  },
] as const;

export const getMethodSteps = (locale: 'fr' | 'en') =>
  locale === 'en' ? englishMethodSteps : methodSteps;
export const getOffers = (locale: 'fr' | 'en') => (locale === 'en' ? englishOffers : offers);
