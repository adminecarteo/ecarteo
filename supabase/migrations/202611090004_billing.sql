begin;

-- Billing data is server-only; role/tenant claims supplied by a browser never select a customer.
create table app_private.billing_customers (
  client_id uuid primary key references public.clients(id) on delete restrict,
  stripe_customer_id text unique check (stripe_customer_id ~ '^cus_[a-zA-Z0-9]+$'),
  livemode boolean not null,
  provisioning_started_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table app_private.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app_private.billing_customers(client_id) on delete restrict,
  plan_key text not null,
  price_id text not null check (price_id ~ '^price_[a-zA-Z0-9]+$'),
  stripe_session_id text unique,
  checkout_url text,
  status text not null default 'creating' check (status in ('creating','open','complete','expired')),
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index billing_checkout_one_pending on app_private.billing_checkout_sessions(client_id)
  where status in ('creating','open');
create index billing_checkout_client_created on app_private.billing_checkout_sessions(client_id, created_at desc);

create table app_private.billing_subscriptions (
  stripe_subscription_id text primary key,
  client_id uuid not null references app_private.billing_customers(client_id) on delete restrict,
  status text not null,
  price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create index billing_subscription_client on app_private.billing_subscriptions(client_id, updated_at desc);

-- Save only event identifiers and type, never webhook bodies or payment details.
create table app_private.billing_webhook_receipts (
  stripe_event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table app_private.billing_customers enable row level security;
alter table app_private.billing_checkout_sessions enable row level security;
alter table app_private.billing_subscriptions enable row level security;
alter table app_private.billing_webhook_receipts enable row level security;
revoke all on app_private.billing_customers, app_private.billing_checkout_sessions,
  app_private.billing_subscriptions, app_private.billing_webhook_receipts from public,anon,authenticated;
grant all on app_private.billing_customers, app_private.billing_checkout_sessions,
  app_private.billing_subscriptions, app_private.billing_webhook_receipts to service_role;

commit;
