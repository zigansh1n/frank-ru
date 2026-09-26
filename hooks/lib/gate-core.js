// The receipts gate, as a pure function. hooks/gate.js is the plumbing around it.
import { detectClaim, detectReceipt, detectOpener, detectSlop } from './claims.js';
import { evidenceAfter } from './evidence.js';
import { MAX_BLOCKS } from './state.js';

const allow = (why) => ({ action: 'allow', kind: why, reason: null });

function normalizeCmd(cmd) {
  return String(cmd || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Did anything in the ledger plausibly correspond to this cited command?
 * The ledger keeps the full command line cut to 500 characters and, separately,
 * the segment that made it count as verification. A long compound command can
 * push that segment past the cut, so both fields are checked.
 */
function matchingLedgerEntries(entries, cited) {
  const want = normalizeCmd(cited);
  if (!want) return [];
  const close = (got) => Boolean(got) && (got === want || got.includes(want) || want.includes(got));
  return entries.filter((e) => close(normalizeCmd(e.cmd)) || close(normalizeCmd(e.matched)));
}

function latestEntry(entries) {
  return entries.reduce((latest, entry) => (
    !latest || Number(entry.ts) >= Number(latest.ts) ? entry : latest
  ), null);
}

/**
 * @param {object} args
 * @param {string} args.message      last assistant message
 * @param {object} args.session      { lastEditTs, evidence[] }
 * @param {string} args.mode         off | lite | full | ultra
 * @param {number} args.blocksThisTurn
 * @param {boolean} args.stopHookActive
 * @param {string|null} args.suggested  command that would produce a receipt here
 * @returns {{action:'allow'|'block', kind:string, reason:string|null}}
 */
export function decide(args) {
  const { message = '', mode = 'full', blocksThisTurn = 0 } = args;
  const base = receiptVerdict(args);
  if (['mode-off', 'stop-hook-active', 'empty-message'].includes(base.kind)) return base;
  if (blocksThisTurn >= (MAX_BLOCKS[mode] ?? 0)) return base;

  const style = styleIssues(message);
  if (!style) return base;
  // One block carries every problem, so a single rewrite can fix them all.
  if (base.action === 'block') {
    return { action: 'block', kind: style.kind === 'opener' ? 'opener' : base.kind, reason: `${style.reason}\n${base.reason}` };
  }
  return { action: 'block', kind: style.kind, reason: style.reason };
}

function styleIssues(message) {
  const opener = detectOpener(message);
  const slop = detectSlop(message);
  const parts = [];
  if (opener.opener) {
    parts.push(`Frank: that message opens with "${opener.matched}". Rewrite it starting with the answer. `
      + 'If the user is right, say why they are right, not that they are.');
  }
  if (slop.length > 0) {
    parts.push(`Frank: stock phrases ${slop.map((p) => `"${p}"`).join(', ')}. Cut them or say the concrete thing instead.`);
  }
  if (parts.length === 0) return null;
  return { kind: opener.opener ? 'opener' : 'slop', reason: parts.join('\n') };
}

function receiptVerdict({
  message = '',
  session = { lastEditTs: 0, evidence: [] },
  mode = 'full',
  blocksThisTurn = 0,
  stopHookActive = false,
  suggested = null,
}) {
  if (mode === 'off') return allow('mode-off');
  if (stopHookActive) return allow('stop-hook-active');
  if (!message.trim()) return allow('empty-message');

  const maxBlocks = MAX_BLOCKS[mode] ?? 0;
  const canBlock = blocksThisTurn < maxBlocks;

  const receipt = detectReceipt(message, { ignoreExamples: true });
  if (receipt.hasUnverified) return allow('honest-unverified');

  const after = evidenceAfter(session, session.lastEditTs || 0);

  if (receipt.hasReceipt) {
    const cited = receipt.ran.map((cmd) => ({ cmd, entry: latestEntry(matchingLedgerEntries(after, cmd)) }));
    const unmatched = cited.filter(({ entry }) => !entry);
    if (unmatched.length > 0) {
      if (!canBlock) return allow('block-budget-spent');
      return {
        action: 'block',
        kind: 'receipt-not-run',
        reason: `Frank: the receipt cites \`${unmatched[0].cmd}\`, which this session has no record of running `
          + 'after the last edit. Run it and quote the real output, or replace the receipt with '
          + '`unverified: <what would verify it>`.',
      };
    }
    const failed = cited.find(({ entry }) => Number(entry.exitCode) !== 0);
    if (failed) {
      if (!canBlock) return allow('block-budget-spent');
      return {
        action: 'block',
        kind: 'receipt-failed',
        reason: `Frank: the receipt cites \`${failed.cmd}\`, but its latest recorded run after the last edit `
          + `exited ${failed.entry.exitCode}. Fix it and re-run, report the failure, or use `
          + '`unverified: <what would verify it>`.',
      };
    }
    return allow('receipt-matches-ledger');
  }

  const claim = detectClaim(message);
  if (!claim.claim) return allow('no-claim');

  if (after.length > 0) {
    const failing = after.filter((e) => Number(e.exitCode) !== 0);
    const passing = after.filter((e) => Number(e.exitCode) === 0);
    const lastFail = failing[failing.length - 1];
    const lastPass = passing[passing.length - 1];
    const contradicted = lastFail && (!lastPass || Number(lastPass.ts) < Number(lastFail.ts));
    if (contradicted) {
      if (!canBlock) return allow('block-budget-spent');
      return {
        action: 'block',
        kind: 'contradiction',
        reason: `Frank: the message claims "${claim.matched}" but the last verification, `
          + `\`${lastFail.cmd}\`, exited ${lastFail.exitCode}. Either fix it and re-run, or say `
          + 'what still fails.',
      };
    }
    return allow('evidence-present');
  }

  if (!canBlock) return allow('block-budget-spent');
  const hint = suggested ? `\`${suggested}\`` : 'the command that would prove it';
  return {
    action: 'block',
    kind: 'no-receipt',
    reason: `Frank: the message claims "${claim.matched}" and nothing ran after the last edit to `
      + `back it up. Run ${hint}, or the narrowest command that covers the change, and end with:\n`
      + '  ran: <command>\n  result: <real output>\n'
      + 'Or, if you are not going to run it, end with `unverified: <what would verify it>`.',
  };
}
