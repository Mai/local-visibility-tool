/**
 * The audit's own URL — the waiting screen and the finished report both live here.
 *
 * A server component unwraps the route params (Next passes them as a promise) and hands
 * the id to the client view that polls. Doing it this way keeps `useParams` out of the
 * component that has real work to do.
 */

import { AuditView } from '@/components/AuditView';

export default async function AuditPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <AuditView auditId={auditId} />
    </main>
  );
}
