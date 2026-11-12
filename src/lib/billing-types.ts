export interface BillingOverview {
  enabled: boolean;
  canManage: boolean;
  hasCustomer: boolean;
  plans: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
  }[];
  subscriptions: {
    id: string;
    status: string;
    plan: string;
    cancelAtPeriodEnd: boolean;
    periodEnd: string | null;
  }[];
  pendingCheckout: boolean;
}
