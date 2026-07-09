import * as z from 'zod/v4';

/** Default page size sent to Billy when the caller omits pageSize (Billy defaults to 1000). */
export const DEFAULT_PAGE_SIZE = 50;

/** Truncates a string at n chars, appending a marker. */
export const cap = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + '…[truncated]' : s);

/** Wraps arbitrary data as a JSON text content block. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }]
  };
}

/** Converts an error into an MCP tool error result, surfacing Billy API details. */
export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true as const
  };
}

/** Common paging fields for list-tool input schemas (spread into z.object). */
export const pagingShape = {
  page: z.number().int().min(1).optional().describe('Page number (1-based)'),
  pageSize: z.number().int().min(1).max(1000).optional().describe('Records per page (max 1000, default 50)')
};

/** Verbosity toggle for tools that return compact records by default. */
export const verbosityShape = {
  verbose: z
    .boolean()
    .optional()
    .describe('Return the full Billy response. Default false: compact records with key fields only (saves ~90% context)')
};

/** Picks a subset of keys from an object, skipping undefined. */
function pick(obj: Record<string, any> | undefined | null, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj) return out;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/**
 * Compacts a Billy response: for each resource key in spec, keeps only the listed fields
 * per record. meta.paging / meta.deletedRecords are always preserved when present so
 * paging state and delete confirmations survive.
 */
export function compactResponse(data: any, spec: Record<string, string[]>): unknown {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};
  if (data.meta?.paging) meta.paging = data.meta.paging;
  if (data.meta?.deletedRecords) meta.deletedRecords = data.meta.deletedRecords;
  if (Object.keys(meta).length > 0) out.meta = meta;
  for (const [key, fields] of Object.entries(spec)) {
    const v = data[key];
    if (Array.isArray(v)) out[key] = v.map((r) => pick(r, fields));
  }
  return out;
}
