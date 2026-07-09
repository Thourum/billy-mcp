import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BillyClient } from '../billy-client.js';
import { compactResponse, DEFAULT_PAGE_SIZE, errorResult, jsonResult, pagingShape, verbosityShape } from './helpers.js';
import { confirmWrite, writeMode } from '../write-guard.js';

/** Billy /files only accepts these types — anything else returns a generic 422. */
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif'
};

const FILE_FIELDS = { files: ['id', 'fileName', 'fileSize', 'fileType', 'isPdf', 'isImage', 'downloadUrl'] };

export function registerAttachmentTools(server: McpServer, billy: BillyClient): void {
  server.registerTool(
    'list_files',
    {
      description: 'List files uploaded to Billy (receipts, invoices PDFs, etc.). Files are append-only via the API.',
      inputSchema: z.object({ ...pagingShape, ...verbosityShape }),
      annotations: { readOnlyHint: true }
    },
    async ({ page, pageSize, verbose }) => {
      try {
        const organizationId = await billy.getOrganizationId();
        const data = await billy.get('/files', { organizationId, page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE });
        return jsonResult(verbose ? data : compactResponse(data, FILE_FIELDS));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    'list_attachments',
    {
      description:
        "List attachments (file↔record links). Filter by owner to see what's attached to a specific record; ownerReference is applied client-side within the page.",
      inputSchema: z.object({
        ownerReference: z
          .string()
          .optional()
          .describe("Owner reference like 'daybookTransaction:<id>', 'invoice:<id>', 'bill:<id>' (client-side filter)"),
        ...pagingShape,
        ...verbosityShape
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ ownerReference, page, pageSize, verbose }) => {
      try {
        const organizationId = await billy.getOrganizationId();
        const data = await billy.get('/attachments', { organizationId, page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE });
        let attachments: any[] = data.attachments ?? [];
        if (ownerReference) attachments = attachments.filter((a) => a.ownerReference === ownerReference);
        const body = { ...data, attachments };
        return jsonResult(
          verbose ? body : compactResponse(body, { attachments: ['id', 'ownerReference', 'fileId', 'priority', 'createdTime'] })
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  if (writeMode === 'read-only') return;

  server.registerTool(
    'upload_file',
    {
      description:
        'Upload a local file (pdf/jpg/jpeg/png/gif ONLY — Billy rejects other types with a 422) to Billy and get its file ID. Files are append-only: they cannot be deleted or modified via the API afterwards. Use attach_file to link the uploaded file to a record.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to a local pdf/jpg/jpeg/png/gif file on the machine running this MCP server'),
        fileName: z.string().optional().describe('Override the file name sent to Billy (defaults to the basename of path)'),
        ...verbosityShape
      }),
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ path, fileName, verbose }, ctx) => {
      try {
        const ext = extname(path).toLowerCase();
        const contentType = MIME_BY_EXT[ext];
        if (!contentType) {
          return errorResult(
            new Error(`Unsupported file type '${ext || '(none)'}'. Billy /files only accepts: ${Object.keys(MIME_BY_EXT).join(', ')}`)
          );
        }
        const bytes = await readFile(path);
        const name = fileName ?? basename(path);
        const organizationId = await billy.getOrganizationId();

        const gate = await confirmWrite(ctx, {
          operation: `Upload file '${name}' (${(bytes.length / 1024).toFixed(1)} KB, ${contentType}) to Billy — files cannot be deleted via the API afterwards`,
          details: { path, fileName: name, contentType, fileSizeBytes: bytes.length }
        });
        if (!gate.ok) return gate.result;

        const res = await billy.postBinary('/files', bytes, { fileName: name, contentType, organizationId });
        return jsonResult(verbose ? res : compactResponse(res, FILE_FIELDS));
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    'attach_file',
    {
      description:
        "Attach an uploaded file to a Billy record (daybook transaction, invoice, or bill). Get the fileId from upload_file or list_files. Example: attach a receipt to journal entry #67 → ownerType 'daybookTransaction', ownerId '<transaction id>'.",
      inputSchema: z.object({
        fileId: z.string().describe('File ID (see upload_file / list_files)'),
        ownerType: z
          .enum(['daybookTransaction', 'invoice', 'bill'])
          .describe('Type of the record to attach the file to'),
        ownerId: z.string().describe('ID of the record to attach the file to'),
        priority: z.number().int().optional().describe('Sort priority among the attachments of the same owner'),
        ...verbosityShape
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ fileId, ownerType, ownerId, priority, verbose }, ctx) => {
      try {
        const organizationId = await billy.getOrganizationId();
        const ownerReference = `${ownerType}:${ownerId}`;
        const gate = await confirmWrite(ctx, {
          operation: `Attach file ${fileId} to ${ownerReference}`,
          details: { fileId, ownerReference, priority }
        });
        if (!gate.ok) return gate.result;

        const res = await billy.post('/attachments', {
          attachment: { organizationId, ownerReference, fileId, priority }
        });
        return jsonResult(
          verbose ? res : compactResponse(res, { attachments: ['id', 'ownerReference', 'fileId', 'priority'] })
        );
      } catch (e) {
        return errorResult(e);
      }
    }
  );
}
