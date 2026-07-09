import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { compactResponse, DEFAULT_PAGE_SIZE, errorResult, jsonResult, pagingShape, verbosityShape } from './helpers.js';
import { confirmWrite, writeMode } from '../write-guard.js';

const COMPACT_SPEC = {
  daybookTransactions: ['id', 'entryDate', 'voucherNo', 'description', 'state', 'apiType'],
  daybookTransactionLines: ['id', 'accountId', 'amount', 'side', 'text']
};

const lineSchema = z.object({
  accountId: z.string().describe('Account ID the line applies to (see list_accounts)'),
  amount: z.number().positive().describe('Line amount (positive; side determines debit/credit)'),
  side: z.enum(['debit', 'credit']).describe('Which side of the entry this line is on'),
  text: z.string().optional().describe('Line description (max ~100 chars)'),
  taxRateId: z.string().optional().describe('Tax rate ID for the line'),
  contraAccountId: z.string().optional().describe('Contra account ID the line is applied against'),
  currencyId: z.string().optional().describe("Currency code, e.g. 'DKK' (defaults to org base currency)")
});

/** Sums debit/credit per currency bucket; returns per-currency totals. */
function balanceCheck(lines: Array<{ amount: number; side: 'debit' | 'credit'; currencyId?: string }>) {
  const buckets = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const key = l.currencyId ?? 'base';
    const b = buckets.get(key) ?? { debit: 0, credit: 0 };
    b[l.side] += l.amount;
    buckets.set(key, b);
  }
  const imbalanced: string[] = [];
  for (const [cur, { debit, credit }] of buckets) {
    if (Math.abs(debit - credit) > 1e-9) {
      imbalanced.push(`${cur}: debit ${debit} != credit ${credit} (diff ${+(debit - credit).toFixed(2)})`);
    }
  }
  return imbalanced;
}

export function registerDaybookTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'list_daybooks',
    {
      description: 'List daybooks in Billy. Find the daybook ID used for manual journal entries.',
      inputSchema: z.object({ ...pagingShape, ...verbosityShape }),
      annotations: { readOnlyHint: true }
    },
    async ({ page, pageSize, verbose }) => {
      try {
        const organizationId = await billy.getOrganizationId();
        const data = await billy.get('/daybooks', { organizationId, page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE });
        return jsonResult(verbose ? data : compactResponse(data, { daybooks: ['id', 'name', 'defaultContraAccountId'] }));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  if (writeMode === 'read-only') return;

  server.registerTool(
    'create_daybook_transaction',
    {
      description:
        'Create a manual journal entry (daybook transaction) in Billy with balanced debit/credit lines. Validates balance client-side before asking for approval. Supports safe-retry deduplication via idempotencyKey. Created as draft by default; state=approved books it immediately.',
      inputSchema: z.object({
        entryDate: z.string().describe('Entry date (YYYY-MM-DD, immutable)'),
        lines: z
          .array(lineSchema)
          .min(2)
          .describe('Journal lines — debits must equal credits per currency or Billy rejects with 422'),
        description: z.string().optional().describe('Header description (max ~100 chars — Billy rejects longer)'),
        extendedDescription: z.string().optional().describe('Extended/verbose description (use for longer text)'),
        voucherNo: z.string().optional().describe('Voucher number, e.g. a bill reference'),
        daybookId: z.string().optional().describe('Daybook ID (see list_daybooks; defaults to the org default)'),
        state: z.enum(['draft', 'approved']).optional().describe("State (default 'draft')"),
        idempotencyKey: z
          .string()
          .optional()
          .describe(
            'Safe-retry dedupe key (stored in apiType): if a transaction with this key already exists it is returned instead of creating a duplicate. Use for retries after timeouts.'
          ),
        organizationId: z.string().optional().describe('Organization ID (auto-resolved when omitted)'),
        ...verbosityShape
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ entryDate, lines, idempotencyKey, organizationId, verbose, ...fields }, ctx) => {
      try {
        const orgId = organizationId ?? (await billy.getOrganizationId());

        // Pre-validate balance BEFORE burning a user approval.
        const imbalanced = balanceCheck(lines);
        if (imbalanced.length > 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Entry is imbalanced — not submitted. Debits must equal credits per currency:\n${imbalanced.join('\n')}`
              }
            ],
            isError: true as const
          };
        }

        // Idempotency: apiType doubles as a documented list filter.
        if (idempotencyKey) {
          const existing = await billy.get('/daybookTransactions', { organizationId: orgId, apiType: idempotencyKey });
          if ((existing.daybookTransactions ?? []).length > 0) {
            const compact = compactResponse(existing, COMPACT_SPEC) as Record<string, unknown>;
            return jsonResult({ deduplicated: true, ...compact });
          }
        }

        const total = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0);
        const currency = lines.find((l) => l.currencyId)?.currencyId ?? 'base currency';
        const gate = await confirmWrite(ctx, {
          operation: `Create daybook transaction ${entryDate}, ${lines.length} lines, total ${total} ${currency}, state ${fields.state ?? 'draft'}`,
          details: { entryDate, ...fields, idempotencyKey, lines }
        });
        if (!gate.ok) return gate.result;

        const res = await billy.post('/daybookTransactions', {
          daybookTransaction: { organizationId: orgId, entryDate, ...fields, apiType: idempotencyKey, lines }
        });
        return jsonResult(verbose ? res : compactResponse(res, COMPACT_SPEC));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    'void_daybook_transaction',
    {
      description: 'Void a daybook transaction (journal entry) in Billy. Irreversible — voided entries cannot be reinstated.',
      inputSchema: z.object({
        id: z.string().describe('Daybook transaction ID'),
        ...verbosityShape
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ id, verbose }, ctx) => {
      try {
        const gate = await confirmWrite(ctx, {
          operation: `Void daybook transaction ${id} (irreversible)`,
          details: { id, state: 'voided' }
        });
        if (!gate.ok) return gate.result;
        const res = await billy.put(`/daybookTransactions/${id}`, { daybookTransaction: { state: 'voided' } });
        return jsonResult(verbose ? res : compactResponse(res, COMPACT_SPEC));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    'batch_void_daybook_transactions',
    {
      description:
        'Void many daybook transactions in one call with ONE user approval for the whole batch. Continues past individual failures and reports per-id results. Irreversible.',
      inputSchema: z.object({
        ids: z.array(z.string()).min(1).max(100).describe('Daybook transaction IDs to void (max 100)'),
        ...verbosityShape
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ ids }, ctx) => {
      try {
        const gate = await confirmWrite(ctx, {
          operation: `Void ${ids.length} daybook transactions (irreversible)`,
          details: { ids }
        });
        if (!gate.ok) return gate.result;

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const id of ids) {
          try {
            await billy.put(`/daybookTransactions/${id}`, { daybookTransaction: { state: 'voided' } });
            results.push({ id, ok: true });
          } catch (e) {
            results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return jsonResult({
          voided: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results
        });
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
