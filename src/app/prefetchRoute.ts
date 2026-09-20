"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keep `href` prefetched for as long as the calling screen is mounted
 * (issue #144).
 *
 * The gear and the back arrow navigate imperatively (`router.push`), and an
 * imperative push never prefetches — only `<Link>` does, and only for routes
 * that are static or carry a `loading.tsx`. Both app routes are dynamic, so
 * without this the tap does nothing visible until the server has streamed
 * its first byte, which on a cold Vercel function + a sleeping Neon compute
 * is the multi-second freeze the issue reports. With the route's loading
 * shell already in the client cache, the skeleton swaps in on the tap itself.
 *
 * Next drops the entry whenever the client cache is purged — every
 * `router.refresh()` (so every resume, ADR-0016) and every Server Action
 * `revalidatePath` — and tells us through `onInvalidate`, which is called at
 * most once per prefetch; re-issuing the prefetch there keeps the shell warm
 * across those purges. The cleanup flag stops a late callback from
 * prefetching for a screen that is no longer mounted.
 */
export function usePrefetchRoute(href: string): void {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const prefetch = () => {
      if (!active) return;
      // Next 16's `PrefetchOptions` type demands a `kind`, but the runtime
      // defaults a missing one to `auto` and its own docs omit it; the enum
      // only exists under `next/dist`, so cast rather than deep-import it.
      router.prefetch(href, { onInvalidate: prefetch } as Parameters<typeof router.prefetch>[1]);
    };
    prefetch();
    return () => {
      active = false;
    };
  }, [router, href]);
}
