import { runInNewContext } from 'node:vm';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { cap, jsonResult } from './helpers.js';
import { confirmWrite, writeMode } from '../write-guard.js';

interface MutationLogEntry {
  seq: number;
  method: string;
  path: string;
  bodySummary: string;
  status: 'executed' | 'dry-run' | 'failed';
  resultIds?: string[];
  error?: string;
}

/** Collects up to `max` record ids from a Billy response's plural resource arrays. */
function collectIds(res: any, max = 20): string[] {
  const ids: string[] = [];
  if (res && typeof res === 'object') {
    for (const v of Object.values(res)) {
      if (!Array.isArray(v)) continue;
      for (const r of v) {
        if (r && typeof r === 'object' && typeof (r as any).id === 'string') {
          ids.push((r as any).id);
          if (ids.length >= max) return ids;
        }
      }
    }
  }
  return ids;
}

function timeoutRejection(ms: number): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`script timed out after ${ms}ms`)), ms);
  });
  return { promise, clear: () => clearTimeout(timer!) };
}

export function registerScriptTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'execute_script',
    {
      description:
        'Run a short JavaScript (ES2022, top-level await allowed) batch script against the Billy API — use for loops, aggregation and reconciliation instead of many single tool calls (e.g. void 30 entries, post 7 monthly journals, sum postings). In scope: `billy` (get(path,query?), post(path,body), put(path,body), del(path), request(method,path,{body,query}), fetchAll(path,resourceKey,query?,maxRecords?) [GET-only], getOrganizationId()) and `console.log`. Return a value or log results. Safety: every mutating HTTP call is logged server-side and the mutation log is ALWAYS returned, even if the script throws; dry_run=true simulates writes without executing them (and skips the approval prompt); in read-only mode non-GET calls are blocked; in confirm mode ONE user approval is requested upfront showing the full script. Limits: default 30s timeout, 50 API calls per run, output capped. Billy gotchas: POST/PUT bodies need singular-key wrapping ({ daybookTransaction: {...} }); Billy silently ignores undocumented query filters; use apiType as idempotency key on daybook transactions.',
      inputSchema: z.object({
        script: z
          .string()
          .describe('JavaScript source. `billy` and `console.log` are in scope. Top-level await allowed. Return a value or console.log results.'),
        dry_run: z
          .boolean()
          .optional()
          .describe('Simulate: non-GET calls are logged and return {dryRun:true} without executing (default false)'),
        max_api_calls: z.number().int().min(1).max(500).optional().describe('API call budget per run (default 50)'),
        timeout_ms: z.number().int().min(1000).max(120000).optional().describe('Script timeout in ms (default 30000)')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ script, dry_run, max_api_calls, timeout_ms }, ctx) => {
      const dryRun = dry_run ?? false;
      const maxApiCalls = max_api_calls ?? 50;
      const timeoutMs = timeout_ms ?? 30000;

      if (writeMode === 'confirm' && !dryRun) {
        const gate = await confirmWrite(ctx, {
          operation: 'Execute script against Billy API (may perform writes)',
          details: { script: cap(script, 1500), max_api_calls: maxApiCalls }
        });
        if (!gate.ok) return gate.result;
      }

      const mutations: MutationLogEntry[] = [];
      let apiCalls = 0;
      let seq = 0;

      const guardedRequest = async (method: string, path: string, opts?: { body?: unknown; query?: Record<string, any> }) => {
        if (++apiCalls > maxApiCalls) throw new Error(`API call budget exceeded (${maxApiCalls})`);
        const m = String(method).toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
        const isWrite = m !== 'GET';
        if (!isWrite) return billy.request(m, path, opts);
        if (writeMode === 'read-only') throw new Error(`read-only mode: ${m} ${path} blocked`);
        const bodySummary = cap(JSON.stringify(opts?.body ?? null), 300);
        if (dryRun) {
          mutations.push({ seq: ++seq, method: m, path, bodySummary, status: 'dry-run' });
          return { dryRun: true, method: m, path };
        }
        try {
          const res = await billy.request(m, path, opts);
          mutations.push({ seq: ++seq, method: m, path, bodySummary, status: 'executed', resultIds: collectIds(res) });
          return res;
        } catch (e) {
          mutations.push({
            seq: ++seq,
            method: m,
            path,
            bodySummary,
            status: 'failed',
            error: e instanceof Error ? e.message : String(e)
          });
          throw e;
        }
      };

      // SECURITY: node:vm is an isolation convenience, NOT a hard security boundary.
      // The facade is the control point — the sandbox must NEVER receive the raw
      // billy client, process, require, fetch, or globalThis. Do not add them.
      const facade = {
        get: (path: string, query?: Record<string, any>) => guardedRequest('GET', path, { query }),
        post: (path: string, body: unknown) => guardedRequest('POST', path, { body }),
        put: (path: string, body: unknown) => guardedRequest('PUT', path, { body }),
        del: (path: string) => guardedRequest('DELETE', path),
        request: guardedRequest,
        // fetchAll is GET-only by construction — safe to delegate directly (still budget-capped per page? no: count as 1 call).
        fetchAll: (path: string, resourceKey: string, query?: Record<string, any>, maxRecords?: number) => {
          if (++apiCalls > maxApiCalls) throw new Error(`API call budget exceeded (${maxApiCalls})`);
          return billy.fetchAll(path, resourceKey, query, maxRecords);
        },
        getOrganizationId: () => billy.getOrganizationId()
      };

      const logs: string[] = [];
      let logChars = 0;
      const sandbox = {
        billy: facade,
        console: {
          log: (...args: unknown[]) => {
            if (logs.length >= 50 || logChars >= 10000) return;
            const line = args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
            logs.push(cap(line, 2000));
            logChars += line.length;
          }
        }
      };

      let returnValue: unknown = null;
      let scriptError: string | undefined;
      const t = timeoutRejection(timeoutMs);
      try {
        // vm timeout only guards synchronous code; async budget = race + API call cap.
        const promise = runInNewContext(`(async () => { ${script}\n})()`, sandbox, { timeout: 5000 });
        returnValue = await Promise.race([Promise.resolve(promise), t.promise]);
      } catch (e) {
        scriptError = e instanceof Error ? e.message : String(e);
      } finally {
        t.clear();
      }

      const executedCount = mutations.filter((m) => m.status === 'executed').length;
      const ok = scriptError === undefined;
      const payload: Record<string, unknown> = {
        ok,
        dryRun,
        apiCalls,
        returnValue: returnValue === undefined ? null : cap(JSON.stringify(returnValue) ?? 'null', 10000),
        logs,
        mutations
      };
      if (!ok) {
        payload.error = scriptError;
        if (executedCount > 0) {
          payload.warning = `script failed after ${executedCount} mutations executed — inspect mutations log before retrying; use idempotency keys (apiType) to avoid duplicates`;
        }
      }
      const result = jsonResult(payload);
      // isError only when the script failed AND nothing mutated — otherwise the
      // model must read the mutation log rather than treat the run as void.
      if (!ok && executedCount === 0) return { ...result, isError: true as const };
      return result;
    }
  );
}
