import type { ComponentProps } from 'react';

/** Marketing and the authenticated Next app use a full document navigation boundary. */
export default function StaticLink(props: ComponentProps<'a'>) {
  return <a {...props} />;
}
