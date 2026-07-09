import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { DEFAULT_PAGE_SIZE, compactResponse, errorResult, jsonResult, pagingShape, verbosityShape } from './helpers.js';
import { confirmWrite, writeMode } from '../write-guard.js';

const CONTACT_FIELDS = {
  contacts: ['id', 'name', 'contactNo', 'countryId', 'isCustomer', 'isSupplier', 'registrationNo', 'phone', 'isArchived'],
  contactPersons: ['id', 'contactId', 'name', 'email', 'isPrimary']
};

export function registerContactTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'list_contacts',
    {
      description:
        'List contacts (customers and suppliers) in Billy. Supports free-text search and filtering. Use this to find a contact ID before creating invoices or bills.',
      inputSchema: z.object({
        q: z.string().optional().describe('Free-text search on name, contactNo, phone, email'),
        isCustomer: z.boolean().optional().describe('Only contacts flagged as customers'),
        isSupplier: z.boolean().optional().describe('Only contacts flagged as suppliers'),
        contactNo: z.string().optional().describe('Filter by exact contact number'),
        phone: z.string().optional().describe('Filter by phone number'),
        isArchived: z.boolean().optional().describe('When true, returns only archived records; when false, only active ones'),
        ...pagingShape,
        ...verbosityShape
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ q, isCustomer, isSupplier, contactNo, phone, isArchived, page, pageSize, verbose }) => {
      try {
        const organizationId = await billy.getOrganizationId();
        const data = await billy.get('/contacts', {
          organizationId,
          q,
          isCustomer,
          isSupplier,
          contactNo,
          phone,
          isArchived,
          page,
          pageSize: pageSize ?? DEFAULT_PAGE_SIZE
        });
        return jsonResult(verbose ? data : compactResponse(data, CONTACT_FIELDS));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    'get_contact',
    {
      description: 'Get a single Billy contact by its ID, including full address and settings.',
      inputSchema: z.object({
        id: z.string().describe('Contact ID')
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => {
      try {
        return jsonResult(await billy.get(`/contacts/${id}`));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  if (writeMode !== 'read-only') {
    server.registerTool(
      'create_contact',
      {
        description:
          'Create a new contact (customer or supplier) in Billy. Returns the created contact including its ID.',
        inputSchema: z.object({
          name: z.string().describe('Company or person name'),
          countryId: z.string().describe("Country code, e.g. 'DK', 'US'"),
          type: z.enum(['company', 'person']).optional().describe("Contact type (default 'company')"),
          street: z.string().optional().describe('Street address'),
          cityText: z.string().optional().describe('City name'),
          zipcodeText: z.string().optional().describe('Zip/postal code'),
          phone: z.string().optional().describe('Phone number'),
          email: z.string().optional().describe('Email used for invoicing (creates a contact person)'),
          registrationNo: z.string().optional().describe('VAT/CVR/tax registration number'),
          contactNo: z.string().optional().describe('Your own reference number for the contact'),
          isCustomer: z.boolean().optional().describe('Contact can receive invoices'),
          isSupplier: z.boolean().optional().describe('Contact can have bills'),
          paymentTermsMode: z.string().optional().describe("Payment terms mode, e.g. 'net'"),
          paymentTermsDays: z.number().int().optional().describe('Days for the payment terms mode'),
          ...verbosityShape
        }),
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      async ({ email, verbose, ...fields }, ctx) => {
        try {
          const organizationId = await billy.getOrganizationId();
          const contact: Record<string, unknown> = { organizationId, ...fields };
          if (email) contact.contactPersons = [{ email, isPrimary: true }];
          const gate = await confirmWrite(ctx, {
            operation: `Create contact '${fields.name}' (${fields.countryId})`,
            details: { contact }
          });
          if (!gate.ok) return gate.result;
          const data = await billy.post('/contacts', { contact });
          return jsonResult(verbose ? data : compactResponse(data, CONTACT_FIELDS));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    server.registerTool(
      'update_contact',
      {
        description: 'Update an existing Billy contact. Only provided fields are changed.',
        inputSchema: z.object({
          id: z.string().describe('Contact ID to update'),
          name: z.string().optional().describe('Company or person name'),
          countryId: z.string().optional().describe("Country code, e.g. 'DK'"),
          type: z.enum(['company', 'person']).optional().describe('Contact type'),
          street: z.string().optional().describe('Street address'),
          cityText: z.string().optional().describe('City name'),
          zipcodeText: z.string().optional().describe('Zip/postal code'),
          phone: z.string().optional().describe('Phone number'),
          registrationNo: z.string().optional().describe('VAT/CVR/tax registration number'),
          contactNo: z.string().optional().describe('Your own reference number'),
          isCustomer: z.boolean().optional().describe('Contact can receive invoices'),
          isSupplier: z.boolean().optional().describe('Contact can have bills'),
          isArchived: z.boolean().optional().describe('Archive/unarchive the contact'),
          ...verbosityShape
        }),
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      async ({ id, verbose, ...fields }, ctx) => {
        try {
          const gate = await confirmWrite(ctx, {
            operation: `Update contact ${id}`,
            details: { contact: fields }
          });
          if (!gate.ok) return gate.result;
          const data = await billy.put(`/contacts/${id}`, { contact: fields });
          return jsonResult(verbose ? data : compactResponse(data, CONTACT_FIELDS));
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }

  server.registerTool(
    'list_contact_persons',
    {
      description: 'List contact persons (names/emails used for sending invoices) belonging to a Billy contact.',
      inputSchema: z.object({
        contactId: z.string().describe('Parent contact ID'),
        ...pagingShape,
        ...verbosityShape
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ contactId, page, pageSize, verbose }) => {
      try {
        const data = await billy.get('/contactPersons', { contactId, page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE });
        return jsonResult(verbose ? data : compactResponse(data, CONTACT_FIELDS));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  if (writeMode !== 'read-only') {
    server.registerTool(
      'create_contact_person',
      {
        description: 'Add a contact person (name and/or email) to an existing Billy contact. Emails are used to mail invoices.',
        inputSchema: z.object({
          contactId: z.string().describe('Parent contact ID'),
          name: z.string().optional().describe('Person name (name or email must be set)'),
          email: z.string().optional().describe('Email address (name or email must be set)'),
          isPrimary: z.boolean().optional().describe('Mark as the primary contact person'),
          ...verbosityShape
        }),
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      async ({ contactId, name, email, isPrimary, verbose }, ctx) => {
        try {
          const contactPerson = { contactId, name, email, isPrimary };
          const gate = await confirmWrite(ctx, {
            operation: `Create contact person for contact ${contactId}`,
            details: { contactPerson }
          });
          if (!gate.ok) return gate.result;
          const data = await billy.post('/contactPersons', { contactPerson });
          return jsonResult(verbose ? data : compactResponse(data, CONTACT_FIELDS));
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }
}
