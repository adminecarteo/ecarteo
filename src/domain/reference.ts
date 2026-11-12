import type {
  Channel,
  Localized,
  ProspectLanguage,
  EvidenceType,
  Criterion,
  Family,
} from './types';

export const CRITERIA_VERSION = 'ecarteo-v1';
export const QUALITY = 'Nadia R.';
export const OPERATORS = ['Inès B.', 'Karim D.', 'Lucie M.', 'Yanis T.'];

export const CHANNELS: Record<Channel, Localized> = {
  form: {
    fr: 'Formulaire',
    en: 'Web form',
  },
  email: {
    fr: 'Email',
    en: 'Email',
  },
  phone: {
    fr: 'Téléphone',
    en: 'Phone',
  },
  whatsapp: {
    fr: 'WhatsApp',
    en: 'WhatsApp',
  },
  chat: {
    fr: 'Chat',
    en: 'Chat',
  },
  social: {
    fr: 'Réseaux sociaux',
    en: 'Social media',
  },
};

export const EVIDENCE_EXPECTED: Record<string, Localized> = {
  formcap: {
    fr: 'Capture du formulaire',
    en: 'Form screenshot',
  },
  emails: {
    fr: 'Emails reçus',
    en: 'Emails received',
  },
  calls: {
    fr: 'Horodatage des appels',
    en: 'Call timestamps',
  },
  callnotes: {
    fr: 'Notes d’appel',
    en: 'Call notes',
  },
  chatcap: {
    fr: 'Captures du chat',
    en: 'Chat screenshots',
  },
  wacap: {
    fr: 'Captures WhatsApp',
    en: 'WhatsApp screenshots',
  },
};

export const LANGS: Record<ProspectLanguage, Localized> = {
  FR: {
    fr: 'Français',
    en: 'French',
  },
  EN: {
    fr: 'Anglais',
    en: 'English',
  },
  ES: {
    fr: 'Espagnol',
    en: 'Spanish',
  },
  AR: {
    fr: 'Arabe',
    en: 'Arabic',
  },
  DE: {
    fr: 'Allemand',
    en: 'German',
  },
  IT: {
    fr: 'Italien',
    en: 'Italian',
  },
  PT: {
    fr: 'Portugais',
    en: 'Portuguese',
  },
  ZH: {
    fr: 'Chinois',
    en: 'Chinese',
  },
};

export const EVTYPES: Record<EvidenceType, Localized> = {
  capture: {
    fr: 'Capture',
    en: 'Screenshot',
  },
  email: {
    fr: 'Email',
    en: 'Email',
  },
  appel: {
    fr: 'Appel',
    en: 'Call',
  },
  note: {
    fr: 'Observation',
    en: 'Observation',
  },
  fichier: {
    fr: 'Fichier',
    en: 'File',
  },
};

export const CRITERIA: Criterion[] = [
  {
    id: 'dispo',
    w: 15,
    name: {
      fr: 'Disponibilité',
      en: 'Availability',
    },
    q: {
      fr: 'Le canal fonctionne-t-il ? Le formulaire part-il ? Le numéro décroche-t-il ?',
      en: 'Does the channel work? Does the form send? Is the phone answered?',
    },
    fix: {
      fr: 'Contrôle hebdomadaire des canaux et alerte en cas de non-décroché',
      en: 'Weekly channel check and alert on unanswered calls',
    },
  },
  {
    id: 'vitesse',
    w: 15,
    name: {
      fr: 'Vitesse',
      en: 'Speed',
    },
    q: {
      fr: 'Première réponse, résolution, relance et respect des horaires annoncés.',
      en: 'First reply, resolution, follow-up and stated opening hours.',
    },
    fix: {
      fr: 'Délai de première réponse fixé à 4 h ouvrées, avec alerte CRM',
      en: 'First reply within 4 business hours, with a CRM alert',
    },
  },
  {
    id: 'compr',
    w: 15,
    name: {
      fr: 'Compréhension',
      en: 'Understanding',
    },
    q: {
      fr: 'Le besoin est-il reformulé ? Les questions sont-elles pertinentes ?',
      en: 'Is the need rephrased? Are the questions relevant?',
    },
    fix: {
      fr: 'Script de qualification en 5 questions',
      en: '5-question qualification script',
    },
  },
  {
    id: 'commercial',
    w: 15,
    name: {
      fr: 'Qualité commerciale',
      en: 'Sales quality',
    },
    q: {
      fr: 'Prochaine étape, prise de rendez-vous, clarté du devis et relance.',
      en: 'Next step, appointment booking, clear quote and follow-up.',
    },
    fix: {
      fr: 'Séquence devis J0 / J+1 / J+3 / J+7 avec proposition de rendez-vous',
      en: 'Quote sequence D0 / D+1 / D+3 / D+7 with an appointment offer',
    },
  },
  {
    id: 'omni',
    w: 10,
    name: {
      fr: 'Cohérence omnicanale',
      en: 'Omnichannel consistency',
    },
    q: {
      fr: 'Même réponse, mêmes prix, mêmes conditions et même ton sur chaque canal.',
      en: 'Same answer, same prices, same terms and same tone on every channel.',
    },
    fix: {
      fr: 'Référentiel unique des prix et conditions, partagé par tous les canaux',
      en: 'Single source of prices and terms shared by every channel',
    },
  },
  {
    id: 'lang',
    w: 15,
    name: {
      fr: 'Qualité linguistique',
      en: 'Language quality',
    },
    q: {
      fr: 'Traitement des prospects non francophones et orientation compétente.',
      en: 'Handling of non-French-speaking prospects and competent routing.',
    },
    fix: {
      fr: 'Routing multilingue et templates de réponse EN / ES / AR',
      en: 'Multilingual routing and EN / ES / AR reply templates',
    },
  },
  {
    id: 'sensible',
    w: 10,
    name: {
      fr: 'Gestion sensible',
      en: 'Sensitive handling',
    },
    q: {
      fr: 'Réclamation, annulation, urgence, vulnérabilité ou information complexe.',
      en: 'Complaint, cancellation, emergency, vulnerability or complex information.',
    },
    fix: {
      fr: 'Procédure d’escalade et FAQ annulation alignée sur tous les canaux',
      en: 'Escalation procedure and cancellation FAQ aligned across channels',
    },
  },
  {
    id: 'suivi',
    w: 5,
    name: {
      fr: 'Relance et ownership',
      en: 'Follow-up and ownership',
    },
    q: {
      fr: 'Une personne est-elle propriétaire de la demande ? Y a-t-il une relance ?',
      en: 'Does someone own the request? Is there a follow-up?',
    },
    fix: {
      fr: 'Un propriétaire nommé par demande et rattrapage automatique',
      en: 'A named owner per request and automatic catch-up',
    },
  },
];

export const FAMILIES: Family[] = [
  {
    id: 'info',
    name: {
      fr: 'Information',
      en: 'Information',
    },
    ex: {
      fr: 'Prix, délai, disponibilité',
      en: 'Price, lead time, availability',
    },
    ind: {
      fr: 'Délai, précision, CTA',
      en: 'Lead time, accuracy, CTA',
    },
    fix: {
      fr: 'Script de qualification',
      en: 'Qualification script',
    },
    tpl: {
      fr: 'Bonjour, merci pour votre demande. Pour vous donner une réponse exacte, puis-je vous poser trois questions : vos dates, le nombre de personnes et votre budget indicatif ? Je vous envoie ensuite une proposition écrite avant [heure].',
      en: 'Hello, thank you for your enquiry. To give you an exact answer, may I ask three questions: your dates, the number of people and your indicative budget? I will then send you a written proposal before [time].',
    },
  },
  {
    id: 'devis',
    name: {
      fr: 'Devis',
      en: 'Quote',
    },
    ex: {
      fr: 'Formulaire puis email',
      en: 'Form then email',
    },
    ind: {
      fr: 'Transmission, complétude',
      en: 'Hand-off, completeness',
    },
    fix: {
      fr: 'Formulaire et séquence',
      en: 'Form and sequence',
    },
    tpl: {
      fr: 'J0 : accusé de réception avec délai annoncé. J+1 : proposition chiffrée et créneau de rendez-vous. J+3 : relance téléphonique. J+7 : dernier message avec date limite de l’offre.',
      en: 'D0: acknowledgement with the reply time stated. D+1: priced proposal and an appointment slot. D+3: phone follow-up. D+7: last message with the offer’s deadline.',
    },
  },
  {
    id: 'tel',
    name: {
      fr: 'Téléphone',
      en: 'Phone',
    },
    ex: {
      fr: 'Appel, absence, rappel, transfert',
      en: 'Call, no answer, callback, transfer',
    },
    ind: {
      fr: 'Décroché, empathie',
      en: 'Pick-up, empathy',
    },
    fix: {
      fr: 'Script et standard',
      en: 'Script and switchboard',
    },
    tpl: {
      fr: 'Décrocher avant la 4e sonnerie. Se présenter : établissement puis prénom. Reformuler la demande. Avant tout transfert, annoncer le nom de l’interlocuteur et le délai de rappel.',
      en: 'Answer before the 4th ring. Introduce yourself: business name, then first name. Rephrase the request. Before any transfer, give the contact’s name and the callback time.',
    },
  },
  {
    id: 'chat',
    name: {
      fr: 'WhatsApp / chat',
      en: 'WhatsApp / chat',
    },
    ex: {
      fr: 'Question puis relance',
      en: 'Question then follow-up',
    },
    ind: {
      fr: 'Temps, ton, continuité',
      en: 'Time, tone, continuity',
    },
    fix: {
      fr: 'Templates conversationnels',
      en: 'Conversation templates',
    },
    tpl: {
      fr: 'Merci pour votre message. Un conseiller vous répond avant [heure]. Pour gagner du temps, pouvez-vous me préciser [question clé] ?',
      en: 'Thank you for your message. An adviser will reply before [time]. To save time, could you tell me [key question]?',
    },
  },
  {
    id: 'recl',
    name: {
      fr: 'Réclamation',
      en: 'Complaint',
    },
    ex: {
      fr: 'Problème plausible',
      en: 'Plausible problem',
    },
    ind: {
      fr: 'Écoute, solution, escalade',
      en: 'Listening, solution, escalation',
    },
    fix: {
      fr: 'Procédure de résolution',
      en: 'Resolution procedure',
    },
    tpl: {
      fr: 'Écouter sans interrompre, reformuler, proposer une solution ou un délai, nommer un responsable, confirmer par écrit sous 24 h.',
      en: 'Listen without interrupting, rephrase, offer a solution or a deadline, name an owner, confirm in writing within 24 h.',
    },
  },
  {
    id: 'annul',
    name: {
      fr: 'Annulation',
      en: 'Cancellation',
    },
    ex: {
      fr: 'Demande contractuelle',
      en: 'Contractual request',
    },
    ind: {
      fr: 'Clarté, friction, délais',
      en: 'Clarity, friction, lead times',
    },
    fix: {
      fr: 'FAQ et workflow',
      en: 'FAQ and workflow',
    },
    tpl: {
      fr: 'Les conditions d’annulation sont identiques sur le site, le chat et l’email de confirmation. Délai de traitement annoncé : 48 h. Confirmation écrite systématique.',
      en: 'Cancellation terms are identical on the website, the chat and the confirmation email. Stated processing time: 48 h. Written confirmation every time.',
    },
  },
  {
    id: 'lang',
    name: {
      fr: 'Langue étrangère',
      en: 'Foreign language',
    },
    ex: {
      fr: 'Prospect non francophone',
      en: 'Non-French-speaking prospect',
    },
    ind: {
      fr: 'Orientation, qualité',
      en: 'Routing, quality',
    },
    fix: {
      fr: 'Routing multilingue',
      en: 'Multilingual routing',
    },
    tpl: {
      fr: 'Hello, thank you for contacting us. A colleague who speaks English will call you back before [time]. May I have your phone number and the best time to reach you?',
      en: 'Hello, thank you for contacting us. A colleague who speaks English will call you back before [time]. May I have your phone number and the best time to reach you?',
    },
  },
  {
    id: 'noresp',
    name: {
      fr: 'No response',
      en: 'No response',
    },
    ex: {
      fr: 'Aucune réponse puis relance',
      en: 'No reply, then follow-up',
    },
    ind: {
      fr: 'Rattrapage, ownership',
      en: 'Catch-up, ownership',
    },
    fix: {
      fr: 'Alertes CRM',
      en: 'CRM alerts',
    },
    tpl: {
      fr: 'Toute demande sans réponse depuis 4 h ouvrées déclenche une alerte au responsable du canal. Chaque demande a un propriétaire nommé jusqu’à sa clôture.',
      en: 'Any request left unanswered for 4 business hours triggers an alert to the channel owner. Every request has a named owner until it is closed.',
    },
  },
];
