/** A public choice used only to suggest editable request text. It grants no access or entitlement. */
export const auditOfferIds = ['flash', 'suivi', 'reseaux'] as const;
export type AuditOfferId = (typeof auditOfferIds)[number];

export function auditOfferId(value: unknown): AuditOfferId | undefined {
  return auditOfferIds.find((id) => id === value);
}

export const requestBriefs: Record<AuditOfferId, { fr: string; en: string }> = {
  flash: {
    fr: 'Évaluer un parcours client sur deux canaux et convenir des améliorations à traiter en priorité.',
    en: 'Review one customer journey across two channels and identify the improvements to tackle first.',
  },
  suivi: {
    fr: 'Évaluer régulièrement le même parcours et vérifier les résultats des actions correctives lors des prochains audits.',
    en: 'Review the same customer journey regularly and check the effect of corrective actions in subsequent audits.',
  },
  reseaux: {
    fr: 'Comparer le même parcours sur plusieurs sites ou dans plusieurs langues et identifier les écarts à corriger.',
    en: 'Compare the same customer journey across locations or languages and identify gaps to address.',
  },
};

export function confirmedSignupPath(value: unknown): string {
  return auditOfferId(value) ? '/app/requests' : '/app';
}

export function offerRequestPath(value: unknown): string {
  const offer = auditOfferId(value);
  return offer ? `/app/requests?offer=${offer}` : '/app';
}
