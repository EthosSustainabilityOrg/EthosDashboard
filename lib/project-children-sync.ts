/**
 * lib/project-children-sync.ts
 * Reconciles a project's child collection (shifts, roles) against what the client holds.
 *
 * WHY THIS IS NOT INLINE IN THE WIZARD
 * The wizard duplicated every shift and role on any re-save that followed an edit. The
 * original guard tracked which children had been created by their array index and threw
 * the whole set away whenever the user touched the list, on the grounds that the indexes
 * no longer lined up. Clearing traded misalignment for duplication: three shifts, a
 * failed publish, one edit, publish again, and the project held six shifts.
 *
 * That bug is invisible to `tsc` and to a click-through that never fails mid-save, which
 * is why the logic lives here as a plain function with an injected `fetcher`. It can be
 * driven through the failure sequences directly, without a browser or a test runner.
 *
 * CONTRACT
 * `known` maps a client-local id to the row id the server assigned. It is mutated in
 * place and is always left describing exactly what the server has, so a throw partway
 * through leaves a state the next retry resumes from rather than duplicating.
 *
 * Order matters: deletes run before writes. Doing it the other way round can trip a
 * server-side uniqueness or capacity rule against a row that is about to be removed.
 */
import type { ApiResponse } from '@/types/api';

export type SyncableChild = { id: string };

export type ReconcileChildrenArgs<T extends SyncableChild> = {
  /** What the client currently holds, in display order. */
  items: T[];
  /** localId -> serverId. Mutated in place. */
  known: Map<string, string>;
  /** Collection endpoint, e.g. `/api/projects/<id>/shifts`. No trailing slash. */
  collectionUrl: string;
  /** Request body for a create or an update. */
  toPayload: (item: T) => Record<string, unknown>;
  /** Field on the create response holding the new row id, e.g. `shift_id`. */
  serverIdField: string;
  /** Singular, user-facing noun for error messages, e.g. `shift`. */
  noun: string;
  headers: HeadersInit;
  /** Injected so this can be driven without a browser. */
  fetcher?: typeof fetch;
  /** Throws a user-facing message when an item is not valid to send. */
  validate?: (item: T) => void;
};

function messageFrom(body: unknown, fallback: string): string {
  const error = (body as ApiResponse<unknown> | null)?.error;
  return error?.message ?? fallback;
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function reconcileChildren<T extends SyncableChild>({
  items,
  known,
  collectionUrl,
  toPayload,
  serverIdField,
  noun,
  headers,
  fetcher = fetch,
  validate,
}: ReconcileChildrenArgs<T>): Promise<void> {
  // 1. Remove rows the client no longer holds.
  const liveIds = new Set(items.map((item) => item.id));

  for (const [localId, serverId] of [...known.entries()]) {
    if (liveIds.has(localId)) continue;

    const res = await fetcher(`${collectionUrl}/${serverId}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const body = await readBody(res);
      const base = messageFrom(body, `That ${noun} could not be removed`);

      // A 409 here is a server rule refusing the delete, for example a shift whose
      // start time has already passed. The map entry stays, so nothing duplicates on
      // retry, and the message says what the user can actually do about it.
      throw new Error(
        res.status === 409
          ? `${base}. Add it back to continue saving, then remove it from the project page.`
          : base,
      );
    }

    known.delete(localId);
  }

  // 2. Create what is new, update what already exists.
  for (const item of items) {
    validate?.(item);

    const payload = toPayload(item);
    const existingServerId = known.get(item.id);

    if (existingServerId) {
      const res = await fetcher(`${collectionUrl}/${existingServerId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(
          messageFrom(await readBody(res), `That ${noun} could not be updated`),
        );
      }

      continue;
    }

    const res = await fetcher(collectionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const body = await readBody(res);
    const record = (body as ApiResponse<Record<string, unknown>> | null)?.data;
    const newId = record?.[serverIdField];

    if (!res.ok || typeof newId !== 'string' || newId.length === 0) {
      throw new Error(messageFrom(body, `That ${noun} could not be created`));
    }

    known.set(item.id, newId);
  }
}
