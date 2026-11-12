import type { ScenarioDraft, Localized, FamilyId, Channel } from './types';

const text = (fr: string, en: string): Localized => ({ fr, en });
export const SECTOR_GUIDES = [
  {
    id: 'hospitality',
    name: text('Hôtellerie et tourisme', 'Hospitality and tourism'),
    checks: text(
      'Vérifier disponibilités, prix total, conditions d’annulation et continuité entre langues et canaux.',
      'Check availability, total price, cancellation terms and continuity across languages and channels.',
    ),
  },
  {
    id: 'health',
    name: text('Cliniques et centres privés', 'Clinics and private centres'),
    checks: text(
      'Évaluer uniquement l’accueil administratif : orientation, accessibilité, confidentialité et clarté des prochaines étapes.',
      'Assess administrative reception only: routing, accessibility, privacy and clarity of next steps.',
    ),
  },
  {
    id: 'training',
    name: text('Organismes de formation', 'Training providers'),
    checks: text(
      'Vérifier programme, prérequis, dates, coût total et distinction entre financement possible et financement garanti.',
      'Check syllabus, entry requirements, dates, total cost and the distinction between possible and guaranteed funding.',
    ),
  },
  {
    id: 'property',
    name: text('Immobilier', 'Real estate'),
    checks: text(
      'Vérifier disponibilité, qualification proportionnée, information cohérente et responsabilité du suivi.',
      'Check availability, proportionate qualification, consistent information and ownership of follow-up.',
    ),
  },
] as const;
type SectorId = (typeof SECTOR_GUIDES)[number]['id'];
export interface ScenarioTemplate {
  id: string;
  sector: SectorId;
  draft: Omit<ScenarioDraft, 'clientId'>;
}
const limits = text(
  'Faire valider le périmètre, les canaux, horaires, seuils et l’identité de test avant exécution. Aucun paiement, engagement, réservation réelle, document officiel falsifié ou enregistrement clandestin. Minimiser les données personnelles et anonymiser les preuves.',
  'Approve the scope, channels, hours, thresholds and test identity before execution. No payment, commitment, real booking, forged official document or covert recording. Minimize personal data and redact evidence.',
);
function template(
  id: string,
  sector: SectorId,
  family: FamilyId,
  title: Localized,
  objective: Localized,
  channels: Channel[],
  steps: [Localized, Localized][],
  evidence: string[],
  language: 'FR' | 'EN' = 'FR',
): ScenarioTemplate {
  return {
    id,
    sector,
    draft: {
      title,
      family,
      objective,
      channels,
      lang: language,
      persona: text(
        'Prospect fictif utilisant l’identité de test autorisée par le client. Adapter le besoin au site audité.',
        'Fictional prospect using the client-authorized test identity. Adapt the need to the audited location.',
      ),
      steps: steps.map(([label, seuil]) => ({ label, seuil })),
      evidence,
      limits,
    },
  };
}
const timing = text(
  'Horodater l’envoi et la réponse. Comparer au délai convenu dans le cadrage.',
  'Record submission and reply timestamps. Compare with the response target agreed in the scope.',
);
const clarity = text(
  'Consigner les éléments reçus, les informations manquantes et la prochaine étape proposée.',
  'Record information received, missing details and the proposed next step.',
);
const followup = text(
  'Respecter le délai et le nombre de relances autorisés ; identifier le responsable de la réponse.',
  'Respect the agreed interval and number of follow-ups; identify who owns the response.',
);

/** Operational starting points authored from the dossier's families; never pre-approved customer instructions. */
export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  template(
    'hotel-quote',
    'hospitality',
    'devis',
    text('Demande de séjour multicanale', 'Cross-channel stay enquiry'),
    text(
      'Contrôler la cohérence de la disponibilité, du prix total et des conditions entre formulaire et email.',
      'Check consistency of availability, total price and terms between web form and email.',
    ),
    ['form', 'email'],
    [
      [
        text(
          'Envoyer une demande de séjour non engageante via le formulaire autorisé.',
          'Send a non-binding stay enquiry through the approved form.',
        ),
        timing,
      ],
      [
        text(
          'Demander par email la confirmation du prix total et des conditions.',
          'Ask for confirmation of total price and terms by email.',
        ),
        clarity,
      ],
      [
        text(
          'Comparer les deux réponses et consigner les différences factuelles.',
          'Compare both replies and record factual differences.',
        ),
        clarity,
      ],
    ],
    ['formcap', 'emails'],
  ),
  template(
    'hotel-international',
    'hospitality',
    'lang',
    text('Accueil d’un voyageur anglophone', 'English-speaking traveller reception'),
    text(
      'Évaluer la compréhension et la continuité d’une demande en anglais.',
      'Assess understanding and continuity of an English enquiry.',
    ),
    ['phone', 'email'],
    [
      [
        text(
          'Demander en anglais des informations pratiques sur le séjour, sans réserver.',
          'Ask in English for practical stay information without booking.',
        ),
        timing,
      ],
      [
        text(
          'Demander un récapitulatif écrit dans la même langue.',
          'Request a written recap in the same language.',
        ),
        clarity,
      ],
    ],
    ['callnotes', 'emails'],
    'EN',
  ),
  template(
    'hotel-cancellation',
    'hospitality',
    'annul',
    text('Clarté des conditions d’annulation', 'Cancellation terms clarity'),
    text(
      'Vérifier qu’un prospect comprend la politique d’annulation avant tout engagement.',
      'Check that a prospect understands cancellation terms before committing.',
    ),
    ['chat', 'email'],
    [
      [
        text(
          'Demander les conditions applicables à une offre publique identifiée.',
          'Ask about the cancellation terms for an identified public offer.',
        ),
        clarity,
      ],
      [
        text(
          'Faire préciser délais, frais et interlocuteur sans créer de réservation.',
          'Clarify deadlines, fees and contact ownership without making a booking.',
        ),
        clarity,
      ],
    ],
    ['chatcap', 'emails'],
  ),
  template(
    'clinic-routing',
    'health',
    'tel',
    text('Orientation administrative par téléphone', 'Administrative phone routing'),
    text(
      'Mesurer l’accueil et le transfert d’une demande administrative non urgente.',
      'Measure reception and routing of a non-urgent administrative enquiry.',
    ),
    ['phone'],
    [
      [
        text(
          'Appeler sur un créneau autorisé pour une information administrative générale.',
          'Call during an approved window for general administrative information.',
        ),
        timing,
      ],
      [
        text(
          'Demander le bon interlocuteur et noter les transferts ou rappels proposés.',
          'Ask for the appropriate contact and record transfers or offered callbacks.',
        ),
        clarity,
      ],
    ],
    ['calls', 'callnotes'],
  ),
  template(
    'clinic-access',
    'health',
    'info',
    text('Informations d’accès et de rendez-vous', 'Access and appointment information'),
    text(
      'Vérifier l’accessibilité et la clarté des modalités administratives, sans avis médical.',
      'Check accessibility and clarity of administrative arrangements without seeking medical advice.',
    ),
    ['form', 'email'],
    [
      [
        text(
          'Demander les modalités d’accès et de prise de rendez-vous, sans symptôme ni donnée de santé.',
          'Ask about access and booking arrangements without symptoms or health data.',
        ),
        timing,
      ],
      [
        text(
          'Vérifier la lisibilité de la réponse et les moyens de recontact.',
          'Check clarity of the reply and available contact channels.',
        ),
        clarity,
      ],
    ],
    ['formcap', 'emails'],
  ),
  template(
    'clinic-followup',
    'health',
    'noresp',
    text('Suivi d’une demande administrative', 'Administrative enquiry follow-up'),
    text(
      'Vérifier la reprise d’une demande administrative restée sans réponse.',
      'Check recovery of an unanswered administrative enquiry.',
    ),
    ['email', 'phone'],
    [
      [
        text(
          'Envoyer une question administrative non urgente à l’adresse autorisée.',
          'Send a non-urgent administrative question to the approved address.',
        ),
        timing,
      ],
      [
        text(
          'Après le délai convenu, effectuer une seule relance si aucune réponse n’est reçue.',
          'After the agreed interval, follow up once if no reply has arrived.',
        ),
        followup,
      ],
    ],
    ['emails', 'callnotes'],
  ),
  template(
    'training-quote',
    'training',
    'devis',
    text('Programme, tarif et financement', 'Course, pricing and funding'),
    text(
      'Vérifier la complétude d’une proposition de formation et les réserves sur le financement.',
      'Check completeness of a course proposal and qualifications on funding.',
    ),
    ['form', 'email'],
    [
      [
        text(
          'Demander programme, prérequis, dates et prix total d’une formation publique.',
          'Request syllabus, prerequisites, dates and total price for a public course.',
        ),
        timing,
      ],
      [
        text(
          'Demander les conditions de financement sans transmettre de justificatif ni déposer de dossier.',
          'Ask about funding conditions without sending documents or making an application.',
        ),
        clarity,
      ],
    ],
    ['formcap', 'emails'],
  ),
  template(
    'training-chat',
    'training',
    'chat',
    text('Conseil et continuité sur messagerie', 'Messaging advice and continuity'),
    text(
      'Contrôler la pertinence des réponses et la reprise du contexte sur messagerie.',
      'Check relevant replies and continuity of context over messaging.',
    ),
    ['whatsapp', 'email'],
    [
      [
        text(
          'Poser une question sur l’adéquation d’une formation avec un besoin fictif autorisé.',
          'Ask whether a course fits an approved fictional need.',
        ),
        timing,
      ],
      [
        text(
          'Demander un récapitulatif écrit puis vérifier la continuité de la réponse.',
          'Request a written recap and check continuity of the response.',
        ),
        clarity,
      ],
    ],
    ['wacap', 'emails'],
  ),
  template(
    'training-language',
    'training',
    'lang',
    text('Orientation d’un candidat anglophone', 'English-speaking applicant guidance'),
    text(
      'Évaluer l’orientation linguistique et la clarté des prérequis.',
      'Assess language routing and clarity of entry requirements.',
    ),
    ['email', 'phone'],
    [
      [
        text(
          'Demander en anglais la langue du cours et les prérequis d’inscription.',
          'Ask in English about course language and entry requirements.',
        ),
        timing,
      ],
      [
        text(
          'Vérifier la cohérence de l’orientation et l’interlocuteur proposé.',
          'Check consistency of routing and the proposed contact.',
        ),
        clarity,
      ],
    ],
    ['emails', 'callnotes'],
    'EN',
  ),
  template(
    'property-availability',
    'property',
    'info',
    text('Disponibilité d’un bien et qualification', 'Property availability and qualification'),
    text(
      'Contrôler la fiabilité des informations et la proportionnalité de la qualification.',
      'Check reliability of information and proportionate qualification.',
    ),
    ['form', 'phone'],
    [
      [
        text(
          'Demander si une annonce publique est disponible, sans prendre de rendez-vous réel.',
          'Ask whether a public listing is available without making a real appointment.',
        ),
        timing,
      ],
      [
        text(
          'Comparer la réponse à l’annonce et noter les questions de qualification.',
          'Compare the reply with the listing and record qualification questions.',
        ),
        clarity,
      ],
    ],
    ['formcap', 'callnotes'],
  ),
  template(
    'property-complaint',
    'property',
    'recl',
    text('Traitement d’une information contradictoire', 'Handling inconsistent information'),
    text(
      'Évaluer l’écoute et la correction d’une contradiction factuelle préautorisée.',
      'Assess listening and correction of a pre-authorized factual inconsistency.',
    ),
    ['email', 'phone'],
    [
      [
        text(
          'Signaler une contradiction prévue au cadrage, sans accusation personnelle ni faux document.',
          'Report an inconsistency agreed in the scope, without personal accusations or fabricated documents.',
        ),
        clarity,
      ],
      [
        text(
          'Demander une clarification et noter la solution et le responsable proposés.',
          'Request clarification and record the proposed resolution and owner.',
        ),
        followup,
      ],
    ],
    ['emails', 'callnotes'],
  ),
  template(
    'property-callback',
    'property',
    'noresp',
    text('Rappel et ownership du prospect', 'Callback and prospect ownership'),
    text(
      'Vérifier la prise en charge d’une demande et la continuité du rappel.',
      'Check ownership of an enquiry and callback continuity.',
    ),
    ['phone', 'email'],
    [
      [
        text(
          'Laisser une demande de rappel sur un besoin fictif autorisé.',
          'Leave a callback request for an approved fictional need.',
        ),
        timing,
      ],
      [
        text(
          'Si nécessaire, relancer une fois par email au délai convenu et noter la reprise du contexte.',
          'If necessary, follow up once by email at the agreed interval and record continuity of context.',
        ),
        followup,
      ],
    ],
    ['callnotes', 'emails'],
  ),
];
