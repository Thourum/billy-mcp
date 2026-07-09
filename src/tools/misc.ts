import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { errorResult, jsonResult } from './helpers.js';
import { confirmWrite, writeMode } from '../write-guard.js';

export function registerMiscTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'billy_raw_request',
    {
      description:
        "Escape hatch: call any Billy API v2 endpoint not covered by a dedicated tool. Examples: GET /currencies, /countries, /taxRates, /salesTaxReturns, /invoiceReminders, /files, /bankLines, /postings, /users. Write requests must wrap the body in a singular resource key, e.g. { \"daybookTransaction\": {...} }. WARNING: POST/PUT/DELETE have real accounting effects — prefer dedicated tools when available. Non-GET methods require BILLY_WRITE_MODE=confirm (user approval) or full; in read-only mode only GET is allowed. CAUTION: Billy SILENTLY IGNORES undocumented query params (no error, just unfiltered results) — cross-check filters against docs/billy-api.md before relying on them.",
      inputSchema: z.object({
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
        path: z
          .string()
          .regex(/^\//, "Path must start with '/'")
          .describe("Endpoint path relative to /v2, e.g. '/currencies' or '/invoices/abc123'"),
        query: z
          .record(z.string(), z.string())
          .optional()
          .describe('Query parameters, e.g. { "organizationId": "...", "page": "2" }'),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('JSON body for POST/PUT, wrapped in the singular resource key'),
        maxChars: z
          .number()
          .int()
          .min(1000)
          .max(200000)
          .optional()
          .describe('Truncate response JSON at this many characters (default 20000). Full data never exceeds this — narrow your query or use paging for more.')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ method, path, query, body, maxChars }, ctx) => {
      try {
        if (method !== 'GET') {
          if (writeMode === 'read-only') {
            return {
              content: [
                { type: 'text' as const, text: 'BILLY_WRITE_MODE=read-only: only GET requests are allowed' }
              ],
              isError: true as const
            };
          }
          const gate = await confirmWrite(ctx, {
            operation: `Raw ${method} ${path}`,
            details: { method, path, query, body }
          });
          if (!gate.ok) return gate.result;
        }
        const data = await billy.request(method, path, { query, body });
        const text = JSON.stringify(data);
        const limit = maxChars ?? 20000;
        if (text.length > limit) {
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  text.slice(0, limit) +
                  `\n…[truncated at ${limit} of ${text.length} chars — add query filters, use page/pageSize, or raise maxChars]`
              }
            ]
          };
        }
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
