import { cap } from './tools/helpers.js';

type WriteMode = 'read-only' | 'confirm' | 'full';

const VALID_MODES: WriteMode[] = ['read-only', 'confirm', 'full'];

/** Resolves the write mode from BILLY_WRITE_MODE. Missing/empty → 'confirm'. Invalid → throws. */
function getWriteMode(): WriteMode {
  const raw = (process.env.BILLY_WRITE_MODE ?? '').trim().toLowerCase();
  if (!raw) return 'confirm';
  if ((VALID_MODES as string[]).includes(raw)) return raw as WriteMode;
  throw new Error(
    `Invalid BILLY_WRITE_MODE: '${process.env.BILLY_WRITE_MODE}'. Valid values: ${VALID_MODES.join(', ')} ` +
      "(default 'confirm' when unset)."
  );
}

/** Write mode resolved once at startup (throws early on invalid env). */
export const writeMode = getWriteMode();

type GateResult =
  | { ok: true }
  | { ok: false; result: { content: { type: 'text'; text: string }[]; isError: true } };

function blocked(text: string): GateResult {
  return {
    ok: false,
    result: { content: [{ type: 'text' as const, text }], isError: true as const }
  };
}

/**
 * Gates a write operation. In 'full' mode passes through; in 'confirm' mode asks the END USER
 * via MCP elicitation. Fails closed on decline/cancel/unchecked/unsupported client.
 */
export async function confirmWrite(
  ctx: any,
  opts: { operation: string; details: Record<string, unknown> }
): Promise<GateResult> {
  if (writeMode === 'full') return { ok: true };

  const detailsJson = cap(JSON.stringify(opts.details, null, 2), 1500);

  let result: any;
  try {
    result = await ctx.mcpReq.elicitInput({
      mode: 'form',
      message: `⚠ Billy write operation requires your approval:\n\n${opts.operation}\n\n${detailsJson}`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean', title: 'Yes, execute this operation' }
        },
        required: ['confirm']
      }
    });
  } catch {
    return blocked(
      'Write blocked: this MCP client does not support elicitation (user-approval dialogs). ' +
        'Set BILLY_WRITE_MODE=full to allow writes without approval, or BILLY_WRITE_MODE=read-only to hide write tools.'
    );
  }

  if (result?.action === 'accept') {
    if (result.content?.confirm === true) return { ok: true };
    return blocked('User left the approval box unchecked — operation NOT executed');
  }
  if (result?.action === 'decline') {
    return blocked('User declined — operation NOT executed');
  }
  return blocked('User dismissed the approval dialog — operation NOT executed');
}
