import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { DEFAULT_PAGE_SIZE, compactResponse, errorResult, jsonResult, pagingShape, verbosityShape } from './helpers.js';
import { confirmWrite, writeMode } from '../write-guard.js';

const PRODUCT_FIELDS = {
  products: ['id', 'name', 'productNo', 'accountId', 'isArchived'],
  productPrices: ['id', 'productId', 'unitPrice', 'currencyId']
};

export function registerProductTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'list_products',
    {
      description:
        'List products in Billy. Use this to find a product ID before creating invoice lines. Supports free-text search.',
      inputSchema: z.object({
        q: z.string().optional().describe('Free-text search on product name/number'),
        productNo: z.string().optional().describe('Filter by exact product number'),
        isArchived: z.boolean().optional().describe('When true, returns only archived records; when false, only active ones'),
        ...pagingShape,
        ...verbosityShape
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ q, productNo, isArchived, page, pageSize, verbose }) => {
      try {
        const organizationId = await billy.getOrganizationId();
        const data = await billy.get('/products', { organizationId, q, productNo, isArchived, page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE });
        return jsonResult(verbose ? data : compactResponse(data, PRODUCT_FIELDS));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    'get_product',
    {
      description: 'Get a single Billy product by ID, plus its per-currency prices.',
      inputSchema: z.object({
        id: z.string().describe('Product ID')
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => {
      try {
        const [product, prices] = await Promise.all([
          billy.get(`/products/${id}`),
          billy.get('/productPrices', { productId: id })
        ]);
        return jsonResult({ product: product.product, productPrices: prices.productPrices });
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  if (writeMode !== 'read-only') {
    server.registerTool(
      'create_product',
      {
        description:
          'Create a product in Billy, optionally with per-currency unit prices. Returns the created product including its ID.',
        inputSchema: z.object({
          name: z.string().describe('Product name'),
          description: z.string().optional().describe('Default description for invoice lines using this product'),
          productNo: z.string().optional().describe('Your own product number/SKU'),
          accountId: z.string().optional().describe('Revenue account to code sales to (defaults to organization default)'),
          salesTaxRulesetId: z.string().optional().describe('Sales tax ruleset ID controlling VAT treatment'),
          prices: z
            .array(
              z.object({
                unitPrice: z.number().describe('Unit price in the given currency'),
                currencyId: z.string().describe("Currency code, e.g. 'DKK', 'EUR', 'USD'")
              })
            )
            .optional()
            .describe('Per-currency unit prices (embedded productPrices)'),
          ...verbosityShape
        }),
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      async ({ prices, verbose, ...fields }, ctx) => {
        try {
          const organizationId = await billy.getOrganizationId();
          const product: Record<string, unknown> = { organizationId, ...fields };
          if (prices) product.prices = prices;
          const gate = await confirmWrite(ctx, {
            operation: `Create product '${fields.name}'`,
            details: { product }
          });
          if (!gate.ok) return gate.result;
          const data = await billy.post('/products', { product });
          return jsonResult(verbose ? data : compactResponse(data, PRODUCT_FIELDS));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    server.registerTool(
      'update_product',
      {
        description:
          'Update an existing Billy product. Only provided fields are changed. Providing prices replaces all existing prices.',
        inputSchema: z.object({
          id: z.string().describe('Product ID to update'),
          name: z.string().optional().describe('Product name'),
          description: z.string().optional().describe('Default invoice-line description'),
          productNo: z.string().optional().describe('Your own product number/SKU'),
          accountId: z.string().optional().describe('Revenue account to code sales to'),
          salesTaxRulesetId: z.string().optional().describe('Sales tax ruleset ID controlling VAT treatment'),
          isArchived: z.boolean().optional().describe('Archive/unarchive the product'),
          prices: z
            .array(
              z.object({
                unitPrice: z.number().describe('Unit price in the given currency'),
                currencyId: z.string().describe("Currency code, e.g. 'DKK'")
              })
            )
            .optional()
            .describe('Replaces ALL existing per-currency prices when set'),
          ...verbosityShape
        }),
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      async ({ id, verbose, ...fields }, ctx) => {
        try {
          const gate = await confirmWrite(ctx, {
            operation: `Update product ${id}`,
            details: { product: fields }
          });
          if (!gate.ok) return gate.result;
          const data = await billy.put(`/products/${id}`, { product: fields });
          return jsonResult(verbose ? data : compactResponse(data, PRODUCT_FIELDS));
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }
}
