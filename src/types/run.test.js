import { describe, it, expect } from 'vitest';
import { ClaimSchema, RunSchema, createRun, parseRun, DEFAULT_RIGOR } from './run.js';

function makeClaim(id) {
  return { id, category: 'outcome_win', text: 'anything', sourceRefs: [] };
}

describe('ClaimSchema.id pattern', () => {
  it('accepts the shapes produced by the claim-extractor prompt', () => {
    const accepted = [
      'claim.question.0',
      'claim.timestamp.start',
      'claim.timestamp.end',
      'claim.outcome.0.win',
      'claim.outcome.12.criterion',
      'claim.edge.3',
      'claim.source.0',
      'claim.threshold.7',
    ];
    for (const id of accepted) {
      const result = ClaimSchema.safeParse(makeClaim(id));
      expect(result.success, `expected ${id} to be accepted`).toBe(true);
    }
  });

  it('accepts camelCase subfields (defensive against prompt tweaks)', () => {
    // Historically the JSDoc example used "resolutionCriteria" — the schema
    // must not regress valid claims just because the prompt switched
    // slug convention.
    const result = ClaimSchema.safeParse(makeClaim('claim.outcome.0.resolutionCriteria'));
    expect(result.success).toBe(true);
  });

  it('rejects ids that do not start with claim.<category>.', () => {
    const rejected = [
      'outcome.0.win',
      'claim.0',
      'claim.',
      '',
      'claim.outcome',
      'claim..0.win',
    ];
    for (const id of rejected) {
      const result = ClaimSchema.safeParse(makeClaim(id));
      expect(result.success, `expected ${JSON.stringify(id)} to be rejected`).toBe(false);
    }
  });
});

// ----------------------------------------------------------- rigor field --

const VALID_RUN_BASE = {
  runId: 'run_test',
  startedAt: 0,
  drafts: [],
  criticisms: [],
  claims: [],
  evidence: [],
  verification: [],
  routing: null,
  aggregation: null,
  finalJson: null,
  cost: { totalTokensIn: 0, totalTokensOut: 0, wallClockMs: 0, byStage: {} },
  log: [],
};

describe('Run.input.rigor', () => {
  it('createRun stamps the legacy field with the supported value', () => {
    const run = createRun({
      question: 'Q?',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      references: '',
      numberOfOutcomes: '',
      rigor: DEFAULT_RIGOR,
    });
    expect(run.input.rigor).toBe(DEFAULT_RIGOR);
  });

  it('createRun defaults rigor when omitted', () => {
    const run = createRun({
      question: 'Q?',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      references: '',
    });
    expect(run.input.rigor).toBe(DEFAULT_RIGOR);
  });

  it('parseRun accepts a run missing input.rigor and defaults it', () => {
    const olderRun = {
      ...VALID_RUN_BASE,
      input: { question: 'Q?', startDate: '2026-01-01', endDate: '2026-12-31', references: '' },
    };
    const parsed = parseRun(olderRun);
    expect(parsed).not.toBeNull();
    expect(parsed.input.rigor).toBe(DEFAULT_RIGOR);
  });

  it('parseRun normalizes old and unknown legacy rigor values', () => {
    const run = {
      ...VALID_RUN_BASE,
      input: { question: 'Q?', startDate: '2026-01-01', endDate: '2026-12-31', references: '', rigor: 'machine' },
    };
    const parsed = parseRun(run);
    expect(parsed).not.toBeNull();
    expect(parsed.input.rigor).toBe(DEFAULT_RIGOR);
    expect(RunSchema.safeParse(run).success).toBe(true);

    const unknown = {
      ...VALID_RUN_BASE,
      input: { question: 'Q?', startDate: '2026-01-01', endDate: '2026-12-31', references: '', rigor: 'yolo' },
    };
    expect(parseRun(unknown)?.input.rigor).toBe(DEFAULT_RIGOR);
  });
});
