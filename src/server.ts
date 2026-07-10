import { McpServer } from '@modelcontextprotocol/server';
import { BillyClient } from './billy-client.js';
import { registerAccountTools } from './tools/accounts.js';
import { registerAttachmentTools } from './tools/attachments.js';
import { registerBillTools } from './tools/bills.js';
import { registerContactTools } from './tools/contacts.js';
import { registerDaybookTools } from './tools/daybook.js';
import { registerInvoiceTools } from './tools/invoices.js';
import { registerMiscTools } from './tools/misc.js';
import { registerOrganizationTools } from './tools/organization.js';
import { registerPaymentTools } from './tools/payments.js';
import { registerProductTools } from './tools/products.js';
import { registerReportingTools } from './tools/reporting.js';
import { registerScriptTools } from './tools/script.js';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'billy', version: '0.3.2' });
  const billy = new BillyClient();

  registerOrganizationTools(server, billy);
  registerContactTools(server, billy);
  registerProductTools(server, billy);
  registerInvoiceTools(server, billy);
  registerPaymentTools(server, billy);
  registerBillTools(server, billy);
  registerAccountTools(server, billy);
  registerDaybookTools(server, billy);
  registerReportingTools(server, billy);
  registerAttachmentTools(server, billy);
  registerScriptTools(server, billy);
  registerMiscTools(server, billy);

  return server;
}
