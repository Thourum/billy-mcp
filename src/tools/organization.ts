import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { errorResult, jsonResult } from './helpers.js';

export function registerOrganizationTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'get_organization',
    {
      description:
        'Get the Billy organization (company) details: name, base currency, VAT settings, default payment terms, fiscal year, invoice numbering. Call this first to learn the organization ID and base currency used by other tools.',
      inputSchema: z.object({
        id: z.string().optional().describe('Organization ID (defaults to the organization tied to the access token)')
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => {
      try {
        const orgId = id ?? (await billy.getOrganizationId());
        return jsonResult(await billy.get(`/organizations/${orgId}`));
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
