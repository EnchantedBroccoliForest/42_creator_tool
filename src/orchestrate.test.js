import { afterEach, describe, expect, it, vi } from 'vitest';
import { installQueryModel, resetQueryModel } from './api/openrouter.js';
import { orchestrate } from './orchestrate.js';
import { getSystemPrompt } from './constants/prompts.js';
import { RIGOR_RUBRIC } from './constants/rubric.js';

const SOURCE_URL = 'https://dead.example/feed';
const BACKUP_SOURCE_URL = 'https://live.example/feed';

function usage(content) {
  return {
    content,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    wallClockMs: 1,
  };
}

function passingReview() {
  return {
    reviewProse: 'No blocking issues found.',
    rubricVotes: RIGOR_RUBRIC.map((rule) => ({
      ruleId: rule.id,
      verdict: 'yes',
      rationale: 'Passes.',
    })),
    criticisms: [],
  };
}

function finalJson() {
  return {
    refinedQuestion: 'Will Team A win?',
    outcomes: [
      { name: 'Yes', winCondition: 'Team A wins.', resolutionCriteria: `Use ${SOURCE_URL}.` },
      { name: 'No', winCondition: 'Team A does not win.', resolutionCriteria: `Use ${SOURCE_URL}.` },
    ],
    marketStartTimeUTC: '2026-01-01T00:00:00Z',
    marketEndTimeUTC: '2026-01-31T23:59:59Z',
    shortDescription: 'Tracks whether Team A wins.',
    fullResolutionRules: `Resolve from ${SOURCE_URL}.`,
    edgeCases: 'If the source is unavailable, No wins.',
  };
}

function failingReview(criticisms = []) {
  return {
    reviewProse: 'Outcomes overlap at the threshold.',
    rubricVotes: RIGOR_RUBRIC.map((rule) => ({
      ruleId: rule.id,
      verdict: 'no',
      rationale: `Fails ${rule.id}: at exactly 100 both outcomes win.`,
    })),
    criticisms,
  };
}

function makeQuery({
  claimsContent,
  entailmentContent,
  onEarlyResolution,
  finalJsonOverride,
  finalizerContent,
  reviewForCall,
}) {
  const calls = {
    drafter: 0,
    claimExtractor: 0,
    structuredReviewer: 0,
    entailmentVerifier: 0,
    earlyResolutionAnalyst: 0,
    finalizer: 0,
  };

  const prompts = { drafter: [] };

  const query = async (_model, messages) => {
    const system = messages?.[0]?.content;
    if (system === getSystemPrompt('drafter')) {
      calls.drafter += 1;
      prompts.drafter.push(messages?.[1]?.content || '');
      const draft = `## Question\nWill Team A win?\n\n## Resolution Rules\nResolve from ${SOURCE_URL}.`;
      return usage(calls.drafter === 1 ? draft : `${draft}\n\nUpdated.`);
    }
    if (system === getSystemPrompt('claimExtractor')) {
      calls.claimExtractor += 1;
      return usage(claimsContent);
    }
    if (system === getSystemPrompt('structuredReviewer')) {
      calls.structuredReviewer += 1;
      const review = reviewForCall ? reviewForCall(calls.structuredReviewer) : passingReview();
      return usage(JSON.stringify(review));
    }
    if (system === getSystemPrompt('entailmentVerifier')) {
      calls.entailmentVerifier += 1;
      return usage(entailmentContent || JSON.stringify([
        { id: 'claim.source.0', entailment: 'entailed', rationale: 'The URL appears in the draft.' },
      ]));
    }
    if (system === getSystemPrompt('earlyResolutionAnalyst')) {
      calls.earlyResolutionAnalyst += 1;
      onEarlyResolution?.();
      return usage('Risk rating: Low\nNo early-resolution issue.');
    }
    if (system === getSystemPrompt('finalizer')) {
      calls.finalizer += 1;
      return usage(finalizerContent ?? JSON.stringify(finalJsonOverride || finalJson()));
    }
    return usage('{}');
  };
  query.calls = calls;
  query.prompts = prompts;
  return query;
}

afterEach(() => {
  resetQueryModel();
});

describe('orchestrate gates', () => {
  it('blocks headless finalize when the pre-finalize source check fails', async () => {
    const query = makeQuery({
      claimsContent: JSON.stringify([
        { id: 'claim.source.0', category: 'source', text: `Resolution source: ${SOURCE_URL}`, sourceRefs: [] },
      ]),
    });
    installQueryModel(query);

    const run = await orchestrate({
      input: {
        question: 'Will Team A win?',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
        references: SOURCE_URL,
      },
      models: {
        drafter: 'mock/drafter',
        reviewers: [{ id: 'mock/reviewer', name: 'Reviewer' }],
      },
      options: {
        aggregation: 'majority',
        escalation: 'always',
        evidence: 'retrieval',
        verifiers: 'full',
      },
      fetchImpl: async () => {
        throw new TypeError('unreachable');
      },
    });

    expect(run.status).toBe('blocked');
    expect(run.sourceAccessibility.status).toBe('all_unreachable');
    expect(run.gates.sources).toEqual({ status: 'all_unreachable', blocked: true });
    expect(query.calls.finalizer).toBe(0);
  });

  it('keeps the fallback gates source threshold aligned for pre-source-stage exits', async () => {
    const query = makeQuery({
      claimsContent: JSON.stringify([
        { id: 'claim.source.0', category: 'source', text: `Primary source: ${SOURCE_URL}`, sourceRefs: [] },
        { id: 'claim.source.1', category: 'source', text: `Backup source: ${BACKUP_SOURCE_URL}`, sourceRefs: [] },
      ]),
      entailmentContent: JSON.stringify([
        { id: 'claim.source.0', entailment: 'entailed', rationale: 'The URL appears in the draft.' },
        { id: 'claim.source.1', entailment: 'entailed', rationale: 'The URL appears in the draft.' },
      ]),
    });
    installQueryModel(query);

    const run = await orchestrate({
      input: {
        question: 'Will Team A win?',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
        references: `${SOURCE_URL}\n${BACKUP_SOURCE_URL}`,
      },
      models: {
        drafter: 'mock/drafter',
        reviewers: [{ id: 'mock/reviewer', name: 'Reviewer' }],
      },
      options: {
        aggregation: 'majority',
        escalation: 'always',
        evidence: 'retrieval',
        verifiers: 'full',
        skipReview: true,
      },
      fetchImpl: async (url) => {
        if (url === SOURCE_URL) throw new TypeError('unreachable');
        return { ok: true, status: 200, type: 'opaque' };
      },
    });

    expect(run.status).toBe('partial');
    expect(run.sourceAccessibility).toBeNull();
    expect(run.gates.sources).toEqual({ status: 'some_unreachable', blocked: true });
  });

  it('records source-check infrastructure errors without blocking finalize', async () => {
    const promiseAllSpy = vi.spyOn(Promise, 'all');

    try {
      const query = makeQuery({
        claimsContent: JSON.stringify([
          { id: 'claim.source.0', category: 'source', text: `Resolution source: ${SOURCE_URL}`, sourceRefs: [] },
        ]),
        onEarlyResolution: () => {
          promiseAllSpy.mockImplementationOnce(() => (
            Promise.reject(new Error('source probe infrastructure failed'))
          ));
        },
      });
      installQueryModel(query);

      const run = await orchestrate({
        input: {
          question: 'Will Team A win?',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-01-31T23:59:59Z',
          references: SOURCE_URL,
        },
        models: {
          drafter: 'mock/drafter',
          reviewers: [{ id: 'mock/reviewer', name: 'Reviewer' }],
        },
        options: {
          aggregation: 'majority',
          escalation: 'always',
          evidence: 'retrieval',
          verifiers: 'full',
        },
        fetchImpl: async () => ({ ok: true, status: 200, type: 'opaque' }),
      });

      expect(run.status).toBe('complete');
      expect(run.sourceAccessibility).toMatchObject({
        status: 'error',
        error: 'source probe infrastructure failed',
      });
      expect(run.gates.sources).toEqual({ status: 'error', blocked: false });
      expect(query.calls.finalizer).toBe(1);
    } finally {
      promiseAllSpy.mockRestore();
    }
  });

  it('treats failed claim extraction as a blocking routing gate', async () => {
    const query = makeQuery({ claimsContent: 'not json' });
    installQueryModel(query);

    const run = await orchestrate({
      input: {
        question: 'Will Team A win?',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
        references: '',
      },
      models: {
        drafter: 'mock/drafter',
        reviewers: [{ id: 'mock/reviewer', name: 'Reviewer' }],
      },
      options: {
        aggregation: 'majority',
        escalation: 'always',
        evidence: 'retrieval',
        verifiers: 'full',
      },
      fetchImpl: async () => ({ ok: true, status: 200, type: 'opaque' }),
    });

    expect(run.status).toBe('blocked');
    expect(run.routing).toMatchObject({ overall: 'blocked', hasBlocking: true });
    expect(run.gates.routing).toEqual({ overall: 'blocked', blocked: true });
    expect(query.calls.finalizer).toBe(0);
  });

  it('fails finalize when outcome names use the reserved OT token prefix', async () => {
    const query = makeQuery({
      claimsContent: JSON.stringify([
        { id: 'claim.source.0', category: 'source', text: `Resolution source: ${SOURCE_URL}`, sourceRefs: [] },
      ]),
      finalJsonOverride: {
        ...finalJson(),
        outcomes: [
          { name: 'OT Yes', winCondition: 'Team A wins.', resolutionCriteria: `Use ${SOURCE_URL}.` },
          { name: 'No', winCondition: 'Team A does not win.', resolutionCriteria: `Use ${SOURCE_URL}.` },
        ],
      },
    });
    installQueryModel(query);

    const run = await orchestrate({
      input: {
        question: 'Will Team A win?',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
        references: SOURCE_URL,
      },
      models: {
        drafter: 'mock/drafter',
        reviewers: [{ id: 'mock/reviewer', name: 'Reviewer' }],
      },
      options: {
        aggregation: 'majority',
        escalation: 'always',
        evidence: 'retrieval',
        verifiers: 'full',
      },
      fetchImpl: async () => ({ ok: true, status: 200, type: 'opaque' }),
    });

    expect(run.status).toBe('error');
    expect(run.finalJson).toBeNull();
    expect(run.log.some((entry) => (
      entry.stage === 'accept'
      && /reserved "OT" token prefix/.test(entry.message)
    ))).toBe(true);
    expect(query.calls.finalizer).toBe(1);
  });
});

const SOURCE_CLAIMS = JSON.stringify([
  { id: 'claim.source.0', category: 'source', text: `Resolution source: ${SOURCE_URL}`, sourceRefs: [] },
]);

function runWith(query, { fetchImpl = async () => ({ ok: true, status: 200, type: 'opaque' }) } = {}) {
  installQueryModel(query);
  return orchestrate({
    input: {
      question: 'Will Team A win?',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
      references: SOURCE_URL,
    },
    models: {
      drafter: 'mock/drafter',
      reviewers: [{ id: 'mock/reviewer', name: 'Reviewer' }],
    },
    options: {
      aggregation: 'majority',
      escalation: 'always',
      evidence: 'retrieval',
      verifiers: 'full',
    },
    fetchImpl,
  });
}

describe('orchestrate fails closed', () => {
  it('ends in error, not complete, when every reviewer fails', async () => {
    const query = makeQuery({
      claimsContent: SOURCE_CLAIMS,
      reviewForCall: () => 'not a review',
    });
    // Unparseable review JSON on both attempts marks the reviewer failed.
    const run = await runWith(query);

    expect(run.status).toBe('error');
    expect(run.log.some((e) => e.stage === 'review' && /All reviewers failed/.test(e.message))).toBe(true);
    expect(query.calls.finalizer).toBe(0);
  });

  it('blocks finalize when reviewers fail every rubric item, even after the update', async () => {
    const query = makeQuery({
      claimsContent: SOURCE_CLAIMS,
      reviewForCall: () => failingReview(),
    });
    const run = await runWith(query);

    expect(run.status).toBe('blocked');
    expect(run.aggregation.overall).toBe('fail');
    expect(run.gates.review).toEqual({ overall: 'fail', blocked: true });
    expect(query.calls.finalizer).toBe(0);
  });

  it('re-reviews the updated draft and accepts it once the fresh review passes', async () => {
    const query = makeQuery({
      claimsContent: SOURCE_CLAIMS,
      reviewForCall: (n) => (n === 1
        ? failingReview([{ claimId: 'claim.source.0', severity: 'blocker', category: 'mece', rationale: 'Overlap at 100.' }])
        : passingReview()),
    });
    const run = await runWith(query);

    expect(query.calls.structuredReviewer).toBe(2);
    expect(run.status).toBe('complete');
    expect(run.aggregation.overall).toBe('pass');
    // The first round's blocker was written against the old draft and
    // must not survive the fresh review.
    expect(run.criticisms).toEqual([]);
  });

  it('gives the updater the reviewers\' reasons, not just decision labels', async () => {
    const query = makeQuery({
      claimsContent: SOURCE_CLAIMS,
      reviewForCall: (n) => (n === 1
        ? failingReview([{ claimId: 'claim.source.0', severity: 'major', category: 'source', rationale: 'Feed has no archive.' }])
        : passingReview()),
    });
    await runWith(query);

    const updatePrompt = query.prompts.drafter[1];
    expect(updatePrompt).toContain('at exactly 100 both outcomes win');
    expect(updatePrompt).toContain('Feed has no archive.');
  });

  it('keeps a blocker pinned to an unknown claim id instead of dropping it', async () => {
    const query = makeQuery({
      claimsContent: SOURCE_CLAIMS,
      reviewForCall: () => ({
        ...passingReview(),
        criticisms: [{ claimId: 'claim.outcome.7.win', severity: 'blocker', category: 'mece', rationale: 'Outcomes overlap.' }],
      }),
    });
    const run = await runWith(query);

    expect(run.routing.overall).toBe('blocked');
    expect(run.status).toBe('blocked');
    expect(query.calls.finalizer).toBe(0);
  });

  it('does not complete when the finalizer returns non-JSON', async () => {
    const query = makeQuery({ claimsContent: SOURCE_CLAIMS, finalizerContent: 'not JSON' });
    const run = await runWith(query);

    expect(run.status).toBe('error');
    expect(run.finalJson).toBeNull();
    expect(run.log.some((e) => e.stage === 'accept' && /not valid JSON/.test(e.message))).toBe(true);
  });

  it('treats a readable HTTP 404 as an unreachable source', async () => {
    const query = makeQuery({ claimsContent: SOURCE_CLAIMS });
    const run = await runWith(query, {
      fetchImpl: async () => ({ ok: false, status: 404, type: 'basic' }),
    });

    expect(run.sourceAccessibility.status).toBe('all_unreachable');
    expect(run.status).toBe('blocked');
    expect(query.calls.finalizer).toBe(0);
  });
});
