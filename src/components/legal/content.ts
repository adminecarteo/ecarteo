import type { Locale } from '@/lib/i18n';

export type LegalPageKind = 'publisher' | 'privacy' | 'terms';
type LegalSection = { title: string; paragraphs: string[]; items?: string[] };
type LegalDocument = { title: string; description: string; sections: LegalSection[] };

export const legalRoutes: Record<LegalPageKind, string> = {
  publisher: '/mentions-legales',
  privacy: '/confidentialite',
  terms: '/conditions',
};

export const legalContent: Record<Locale, Record<LegalPageKind, LegalDocument>> = {
  fr: {
    publisher: {
      title: 'Mentions légales',
      description:
        'L’éditeur d’Écartéo, ses coordonnées et les services qui hébergent la plateforme.',
      sections: [
        {
          title: 'Éditeur et contact',
          paragraphs: [
            'Écartéo est un service d’INTERTRAD, société par actions simplifiée (SAS), domiciliée au 91 rue du Faubourg Saint-Honoré, 75008 Paris, France.',
            'SIREN : 827 584 566. SIRET du siège : 827 584 566 00018. Responsable de la publication : Hasnain Muzaffar, président.',
            'Pour toute question sur le service, une demande d’assistance ou vos données personnelles : admin-dev@ecarteo.fr. Vous pouvez également écrire à l’adresse du siège en précisant « Écartéo ».',
          ],
        },
        {
          title: 'Hébergement et services techniques',
          paragraphs: [
            'L’application est hébergée par Render Services, Inc., avec une instance dans la région de Francfort. Adresse de contact publiée par Render : 525 Brannan Street, Suite 300, San Francisco, CA 94107, États-Unis ; téléphone : +1 415 319 8186.',
            'La base de données, l’authentification et les fichiers privés utilisent Supabase, avec un projet situé dans la région de Paris. Les messages de confirmation de compte et de récupération sont envoyés par la messagerie one.com depuis admin-dev@ecarteo.fr.',
            'Les régions du projet décrivent l’implantation des services utilisés ; elles ne signifient pas que toutes les opérations d’assistance des prestataires se déroulent dans l’Union européenne. La notice de confidentialité précise les destinataires et le traitement de vos demandes.',
          ],
        },
        {
          title: 'Objet du site',
          paragraphs: [
            'Écartéo présente et accompagne un service d’audit du parcours client : cadrage, missions, preuves, rapports et actions correctives. Les conditions commerciales d’une prestation sont convenues avec le client avant son exécution.',
          ],
        },
      ],
    },
    privacy: {
      title: 'Confidentialité',
      description:
        'Comprendre les données utilisées par Écartéo et savoir comment nous contacter à leur sujet.',
      sections: [
        {
          title: 'Qui traite vos données ?',
          paragraphs: [
            'INTERTRAD, 91 rue du Faubourg Saint-Honoré, 75008 Paris, administre Écartéo et les données nécessaires à ses comptes, à la relation de service et à la sécurité. Notre contact pour les données personnelles est admin-dev@ecarteo.fr.',
            'Pour les données de mission traitées sur instruction d’une organisation cliente, les responsabilités et instructions sont précisées dans le cadre de la prestation convenue. Une demande reçue par Écartéo est examinée avec l’organisation concernée lorsque cela est nécessaire.',
          ],
        },
        {
          title: 'Données et finalités',
          paragraphs: [
            'Nous utilisons les informations que vous renseignez et celles que les personnes autorisées de votre organisation ajoutent au dossier. Les comptes et accès professionnels servent à fournir le service demandé ; les demandes de devis et missions permettent d’en préparer et suivre l’exécution.',
            'La gestion des contacts professionnels, des accès et de la sécurité repose sur notre intérêt légitime à fournir et protéger le service. Lorsqu’une personne est elle-même partie à une prestation, les données nécessaires à sa demande ou à son contrat servent aux démarches précontractuelles et à son exécution. Les demandes de droits sont traitées pour respecter les obligations applicables.',
          ],
          items: [
            'Compte : nom, adresse email, organisation, rôle et droits d’accès.',
            'Dossier d’audit : demande, scénario, observations, scores, commentaires, dates, preuves, rapport et actions de suivi.',
            'Exploitation : informations de connexion et événements nécessaires à la sécurité, à l’assistance et au suivi des opérations.',
            'Les champs signalés comme obligatoires sont nécessaires à l’action demandée. Sans les informations de compte requises, nous ne pouvons pas créer l’accès ; sans le périmètre d’une mission, nous ne pouvons pas la préparer.',
          ],
        },
        {
          title: 'Accès et prestataires',
          paragraphs: [
            'L’équipe qualité administre le service. Les opérateurs accèdent aux missions qui leur sont attribuées. Les clients accèdent aux rapports et preuves publiés de leur organisation. Les informations nécessaires à une demande d’assistance peuvent être consultées par les personnes chargées de la traiter.',
            'Render fournit l’hébergement de l’application ; Supabase fournit la base de données, l’authentification et le stockage privé ; one.com transmet les emails d’authentification. Les projets utilisés sont situés respectivement à Francfort et Paris pour Render et Supabase.',
            'Les opérations d’assistance ou les sous-traitants de ces prestataires peuvent impliquer des accès hors de l’Espace économique européen. Les documents des prestataires présentent leurs modalités et garanties de transfert. Contactez-nous pour les informations applicables à votre prestation ; le choix d’une région européenne ne constitue pas une garantie d’absence de transfert.',
          ],
        },
        {
          title: 'Conservation et fin de service',
          paragraphs: [
            'Les données de compte sont conservées pour l’accès actif et le suivi de la relation de service. Les données de mission sont conservées pour l’exécution, la consultation des livrables et le suivi convenus avec le client. La durée dépend du périmètre et de la période de suivi de la prestation, ainsi que des obligations ou litiges qui nécessitent de préserver certains éléments.',
            'À la clôture d’un compte ou d’une prestation, une revue manuelle détermine les données encore nécessaires, les restrictions d’accès et les opérations de suppression ou d’anonymisation possibles. Les éléments conservés pour une obligation ou un litige sont limités à ce besoin. Une demande d’effacement est également examinée au regard des fichiers et copies de sauvegarde concernés.',
            'La fermeture d’un compte ne déclenche pas un effacement automatique. Un rapport publié conserve son état validé ; les corrections peuvent prendre la forme de compléments datés. Ces règles techniques ne suppriment pas les droits applicables aux personnes.',
          ],
        },
        {
          title: 'Cookies et stockage du navigateur',
          paragraphs: [
            'Des cookies d’authentification permettent de conserver et sécuriser la session. Le cookie de langue mémorise le français ou l’anglais pendant un an. Le navigateur conserve également les préférences de langue et de thème, ainsi que des brouillons liés à sa session pour éviter la perte du travail en cours.',
            'Vous pouvez effacer ces éléments dans les réglages du navigateur. Cela peut vous déconnecter, réinitialiser vos préférences ou supprimer les brouillons non enregistrés.',
          ],
        },
        {
          title: 'Exercer vos droits',
          paragraphs: [
            'Écrivez à admin-dev@ecarteo.fr en indiquant le compte, l’organisation ou le dossier concerné. Ne transmettez pas de mot de passe. Nous pouvons demander les informations strictement nécessaires pour vérifier votre identité et le périmètre de votre demande.',
            'Vous disposez des droits applicables d’accès, de rectification, d’effacement et de limitation. Selon le traitement et sa base légale, vous pouvez également exercer un droit d’opposition ou à la portabilité. Vous pouvez introduire une réclamation auprès de la CNIL.',
          ],
        },
      ],
    },
    terms: {
      title: 'Conditions d’utilisation',
      description:
        'Le fonctionnement de votre espace Écartéo et les règles d’utilisation du service.',
      sections: [
        {
          title: 'Le service',
          paragraphs: [
            'Écartéo est exploité par INTERTRAD. La plateforme rassemble les demandes d’audit, les missions, les preuves, les rapports et les actions correctives dans des espaces clients distincts.',
            'La création d’un compte ou l’envoi d’une demande ne déclenche pas à lui seul une prestation payante ni un abonnement. Le périmètre, les autorisations d’exécution, les livrables, le calendrier, le prix et les conditions de paiement sont convenus dans le devis ou le contrat de la prestation.',
          ],
        },
        {
          title: 'Votre compte',
          paragraphs: [
            'Chaque utilisateur utilise son propre compte et protège ses moyens de connexion. Les rôles et accès sont attribués par les personnes habilitées. Signalez à admin-dev@ecarteo.fr tout accès que vous pensez compromis ou qui ne correspond pas à votre fonction.',
            'Les informations du compte et de l’organisation doivent permettre de vous identifier et de préparer correctement les prestations demandées. L’utilisation d’un compte ne donne aucun droit d’accès aux dossiers d’une autre organisation.',
          ],
        },
        {
          title: 'Missions et pièces transmises',
          paragraphs: [
            'Les missions doivent rester dans le périmètre autorisé avec le client. Transmettez uniquement les informations et pièces nécessaires à ce périmètre, que vous êtes autorisé à communiquer. Les autorisations de terrain, la confidentialité et l’information des personnes concernées doivent être prises en compte avant l’exécution.',
            'N’ajoutez pas de secrets de connexion ou de données sensibles sans nécessité et cadre explicite. N’utilisez pas la plateforme pour accéder sans autorisation à un système, contourner un contrôle ou publier des informations étrangères à la mission.',
          ],
        },
        {
          title: 'Rapports et corrections',
          paragraphs: [
            'L’équipe qualité examine les observations et la notation avant la publication. Le rapport décrit le parcours évalué, avec les éléments disponibles pour la mission ; il ne constitue pas une garantie générale de performance future.',
            'Le client peut consulter les éléments publiés et suivre les actions associées. Un rapport publié conserve l’état validé. Une demande de correction peut être adressée au support et donner lieu à un complément daté accompagnant le rapport d’origine.',
          ],
        },
        {
          title: 'Assistance et fin d’accès',
          paragraphs: [
            'Pour une question, une difficulté d’accès ou une demande de fermeture de compte, écrivez à admin-dev@ecarteo.fr. Une interruption technique ou une maintenance peut affecter temporairement l’accès ; les éventuels engagements de disponibilité et d’assistance sont ceux de la prestation convenue.',
            'Les conditions commerciales, d’annulation et de règlement des différends sont celles du contrat applicable et du droit applicable. Le traitement des données à la fin du service est décrit dans la notice de confidentialité.',
          ],
        },
      ],
    },
  },
  en: {
    publisher: {
      title: 'Legal notice',
      description: 'Écartéo’s publisher, contact details and the services hosting the platform.',
      sections: [
        {
          title: 'Publisher and contact',
          paragraphs: [
            'Écartéo is operated by INTERTRAD, a French simplified joint-stock company (SAS), registered at 91 rue du Faubourg Saint-Honoré, 75008 Paris, France.',
            'SIREN: 827 584 566. Headquarters SIRET: 827 584 566 00018. Publication lead: Hasnain Muzaffar, president.',
            'For service questions, assistance or personal-data requests: admin-dev@ecarteo.fr. You may also write to the registered address, marked “Écartéo”.',
          ],
        },
        {
          title: 'Hosting and technical services',
          paragraphs: [
            'The application is hosted by Render Services, Inc., using an instance in its Frankfurt region. Render’s published contact address is 525 Brannan Street, Suite 300, San Francisco, CA 94107, United States; telephone: +1 415 319 8186.',
            'Database, authentication and private file storage use a Supabase project in its Paris region. Account confirmation and recovery messages are sent through one.com email services from admin-dev@ecarteo.fr.',
            'Project regions describe where the selected services run; they do not mean that every provider support operation takes place in the European Union. The privacy notice explains recipients and how requests are handled.',
          ],
        },
        {
          title: 'Purpose of the website',
          paragraphs: [
            'Écartéo presents and supports a customer journey audit service: scope, missions, evidence, reports and corrective actions. Commercial terms for a service are agreed with the customer before it is carried out.',
          ],
        },
      ],
    },
    privacy: {
      title: 'Privacy',
      description: 'Understand how Écartéo uses information and how to contact us about it.',
      sections: [
        {
          title: 'Who processes your information?',
          paragraphs: [
            'INTERTRAD, 91 rue du Faubourg Saint-Honoré, 75008 Paris, administers Écartéo and the information required for accounts, service relationships and security. Our personal-data contact is admin-dev@ecarteo.fr.',
            'For mission data processed on a customer organisation’s instructions, responsibilities and instructions are specified as part of the agreed service. Requests received by Écartéo are reviewed with the relevant organisation when necessary.',
          ],
        },
        {
          title: 'Information and purposes',
          paragraphs: [
            'We use information you provide and information that authorised people from your organisation add to a file. Professional accounts and permissions provide access to the requested service; quotation requests and mission records support its preparation and delivery.',
            'Managing professional contacts, access and security relies on our legitimate interest in providing and protecting the service. Where an individual is a party to a service contract, information required for their request or contract also supports pre-contractual steps and its performance. Rights requests are handled to meet applicable obligations.',
          ],
          items: [
            'Account: name, email, organisation, role and access permissions.',
            'Audit file: request, scenario, observations, scores, comments, dates, evidence, report and follow-up actions.',
            'Operations: sign-in information and events needed for security, assistance and operational oversight.',
            'Fields marked as required are needed for the requested action. Without required account information we cannot create access; without a mission’s scope we cannot prepare it.',
          ],
        },
        {
          title: 'Access and providers',
          paragraphs: [
            'Quality staff administer the service. Operators access missions assigned to them. Customers access published reports and evidence for their organisation. People handling a support request may consult information needed to resolve it.',
            'Render hosts the application; Supabase supplies the database, authentication and private storage; one.com delivers authentication emails. The selected Render and Supabase project regions are Frankfurt and Paris respectively.',
            'Provider support operations or subprocessors may involve access outside the European Economic Area. Provider documents describe their transfer arrangements and safeguards. Contact us for information applicable to your service; selecting a European region does not guarantee that no transfer occurs.',
          ],
        },
        {
          title: 'Retention and end of service',
          paragraphs: [
            'Account information is retained for active access and management of the service relationship. Mission data is retained for delivery, access to deliverables and follow-up agreed with the customer. The period depends on the agreed scope and follow-up, and on obligations or disputes requiring particular records to be preserved.',
            'When an account or service closes, a manual review determines what information remains necessary, access restrictions and appropriate deletion or anonymisation. Information kept for an obligation or dispute is limited to that purpose. An erasure request also considers relevant files and backup copies.',
            'Closing an account does not automatically erase its records. A published report preserves its approved state, and dated supplements can record corrections. These technical arrangements do not remove applicable personal-data rights.',
          ],
        },
        {
          title: 'Cookies and browser storage',
          paragraphs: [
            'Authentication cookies maintain and secure your session. A language cookie remembers French or English for one year. The browser also stores language/theme preferences and session-scoped work drafts to reduce loss of unfinished work.',
            'You can remove these items in your browser settings. Doing so may sign you out, reset preferences or remove drafts you have not saved.',
          ],
        },
        {
          title: 'Exercising your rights',
          paragraphs: [
            'Write to admin-dev@ecarteo.fr, identifying the relevant account, organisation or file. Do not send a password. We may request information strictly needed to verify your identity and the scope of the request.',
            'Applicable rights include access, correction, erasure and restriction. Depending on the processing and its legal basis, rights to object or to data portability may also apply. You may submit a complaint to the CNIL.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of use',
      description: 'How your Écartéo workspace operates and the rules for using the service.',
      sections: [
        {
          title: 'The service',
          paragraphs: [
            'Écartéo is operated by INTERTRAD. The platform brings audit requests, missions, evidence, reports and corrective actions together in separate customer workspaces.',
            'Creating an account or submitting a request does not itself start a paid service or subscription. Scope, execution permissions, deliverables, schedule, price and payment conditions are agreed in the service quotation or contract.',
          ],
        },
        {
          title: 'Your account',
          paragraphs: [
            'Each user uses their own account and protects their sign-in credentials. Authorised people assign roles and permissions. Contact admin-dev@ecarteo.fr if you suspect compromised access or permissions that do not match your role.',
            'Account and organisation information must identify you and enable the requested service to be prepared correctly. An account does not grant access to another organisation’s files.',
          ],
        },
        {
          title: 'Missions and submitted material',
          paragraphs: [
            'Missions must stay within the scope authorised with the customer. Submit only information and material necessary for that scope which you are entitled to share. Fieldwork permissions, confidentiality and information for affected people must be considered before execution.',
            'Do not add sign-in secrets or sensitive data without necessity and an explicit framework. Do not use the platform to access systems without authorisation, bypass controls or publish material unrelated to the mission.',
          ],
        },
        {
          title: 'Reports and corrections',
          paragraphs: [
            'Quality staff review observations and scoring before publication. Reports describe the assessed journey using the evidence available for the mission; they are not a general guarantee of future performance.',
            'Customers can consult published material and track associated actions. A published report preserves its approved state. A correction request can be sent to support and may lead to a dated supplement accompanying the original report.',
          ],
        },
        {
          title: 'Assistance and end of access',
          paragraphs: [
            'For questions, access difficulties or account-closure requests, write to admin-dev@ecarteo.fr. Technical interruptions or maintenance may temporarily affect access; any availability or assistance commitments are those of the agreed service.',
            'Commercial, cancellation and dispute terms are those of the applicable contract and law. Data handling at the end of service is described in the privacy notice.',
          ],
        },
      ],
    },
  },
};
