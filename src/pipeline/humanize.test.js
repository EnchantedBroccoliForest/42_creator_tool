import { describe, it, expect, vi } from 'vitest';
import { humanizeFinalJson, mergeHumanized } from './humanize.js';

const SAMPLE_FINAL = {
  refinedQuestion: 'Will Team A win the 2026 finals?',
  outcomes: [
    { name: 'Team A', winCondition: 'Team A serves as the champion.', resolutionCriteria: 'Actually, the official box score indicates Team A.' },
    { name: 'Team B', winCondition: 'Team B serves as the champion.', resolutionCriteria: 'Per the official box score.' },
    { name: 'Other / None', winCondition: 'Neither listed team wins.', resolutionCriteria: 'Official box score shows no listed team.' },
  ],
  marketStartTimeUTC: '2026-05-01T00:00:00Z',
  marketEndTimeUTC: '2026-06-15T23:59:59Z',
  shortDescription: 'It is important to note this market tracks the finals — a testament to fandom.',
  fullResolutionRules: '1. Read https://example.com/boxscore. 2. Map winner to the named outcome.',
  edgeCases: '1. Series postponed past end date → Other / None',
};

describe('mergeHumanized', () => {
  it('adopts a structurally stable shortDescription', () => {
    const { merged, rejectedFields } = mergeHumanized(SAMPLE_FINAL, {
      ...SAMPLE_FINAL,
      shortDescription: 'Tracks the 2026 finals winner.',
    });
    expect(merged.shortDescription).toBe('Tracks the 2026 finals winner.');
    expect(rejectedFields).toEqual([]);
  });

  it('never adopts changes to settlement-bearing fields', () => {
    const humanized = {
      refinedQuestion: 'Does Team A win the 2026 finals?',
      outcomes: [
        { name: 'TEAM A (GOATS)', winCondition: 'Team A is the champion.', resolutionCriteria: 'Box score names Team A.' },
        { name: 'Team B', winCondition: 'Team B is the champion.', resolutionCriteria: 'Box score names Team B.' },
        { name: 'Other', winCondition: 'Nobody listed wins.', resolutionCriteria: 'Box score shows no listed team.' },
      ],
      marketStartTimeUTC: '2026-05-01T00:00:01Z',
      marketEndTimeUTC: '2026-06-16T00:00:00Z',
      fullResolutionRules: '1. Read https://example.com/boxscore. 2. Map winner.',
      edgeCases: '1. Series postponed past end date → Other / None',
    };
    const { merged } = mergeHumanized(SAMPLE_FINAL, humanized);
    expect(merged.refinedQuestion).toBe(SAMPLE_FINAL.refinedQuestion);
    expect(merged.outcomes).toEqual(SAMPLE_FINAL.outcomes);
    expect(merged.marketStartTimeUTC).toBe(SAMPLE_FINAL.marketStartTimeUTC);
    expect(merged.marketEndTimeUTC).toBe(SAMPLE_FINAL.marketEndTimeUTC);
    expect(merged.fullResolutionRules).toBe(SAMPLE_FINAL.fullResolutionRules);
    expect(merged.edgeCases).toBe(SAMPLE_FINAL.edgeCases);
  });

  it('keeps a negated win condition out of the final JSON', () => {
    // A token guard alone accepts this: every number and name survives,
    // but the meaning flips. Settlement fields must never be rewritten.
    const original = {
      ...SAMPLE_FINAL,
      outcomes: [
        { name: 'Yes', winCondition: 'YES wins if BTC exceeds 100.', resolutionCriteria: 'Coinbase BTC-USD close.' },
        { name: 'No', winCondition: 'NO wins otherwise.', resolutionCriteria: 'Coinbase BTC-USD close.' },
      ],
    };
    const humanized = {
      ...original,
      outcomes: [
        { name: 'Yes', winCondition: 'YES wins if BTC does not exceed 100.', resolutionCriteria: 'Coinbase BTC-USD close.' },
        original.outcomes[1],
      ],
    };
    const { merged } = mergeHumanized(original, humanized);
    expect(merged.outcomes[0].winCondition).toBe('YES wins if BTC exceeds 100.');
  });

  it('falls back to the original shortDescription when humanized value is empty or wrong type', () => {
    expect(mergeHumanized(SAMPLE_FINAL, { shortDescription: '' }).merged.shortDescription)
      .toBe(SAMPLE_FINAL.shortDescription);
    expect(mergeHumanized(SAMPLE_FINAL, { shortDescription: 42 }).merged.shortDescription)
      .toBe(SAMPLE_FINAL.shortDescription);
  });

  it('returns the original when humanized input is not a plain object', () => {
    expect(mergeHumanized(SAMPLE_FINAL, null).merged).toBe(SAMPLE_FINAL);
    expect(mergeHumanized(SAMPLE_FINAL, 'string').merged).toBe(SAMPLE_FINAL);
    expect(mergeHumanized(SAMPLE_FINAL, []).merged).toBe(SAMPLE_FINAL);
  });

  it('rejects a shortDescription that drops a protected token', () => {
    const original = { ...SAMPLE_FINAL, shortDescription: 'Settles on the 30% turnout figure from https://example.com/turnout.' };
    const { merged, rejectedFields } = mergeHumanized(original, {
      shortDescription: 'Settles on the turnout figure.',
    });
    expect(merged.shortDescription).toBe(original.shortDescription);
    expect(rejectedFields).toEqual(['shortDescription']);
  });
});

describe('humanizeFinalJson', () => {
  it('skips work when finalJson is the `{ raw: ... }` fallback', async () => {
    const query = vi.fn();
    const result = await humanizeFinalJson('m', { raw: 'not-json' }, { queryModel: query });
    expect(query).not.toHaveBeenCalled();
    expect(result.humanizedJson).toEqual({ raw: 'not-json' });
    expect(result.logEntry.level).toBe('info');
    expect(result.logEntry.message).toMatch(/not structured JSON/);
  });

  it('returns the original JSON when the model throws', async () => {
    const query = vi.fn().mockRejectedValue(new Error('rate limited'));
    const result = await humanizeFinalJson('m', SAMPLE_FINAL, { queryModel: query });
    expect(result.humanizedJson).toBe(SAMPLE_FINAL);
    expect(result.logEntry.level).toBe('warn');
    expect(result.logEntry.message).toMatch(/rate limited/);
  });

  it('returns the original JSON when the model output is not valid JSON', async () => {
    const query = vi.fn().mockResolvedValue({
      content: 'sorry, I cannot do that',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      wallClockMs: 50,
    });
    const result = await humanizeFinalJson('m', SAMPLE_FINAL, { queryModel: query });
    expect(result.humanizedJson).toBe(SAMPLE_FINAL);
    expect(result.logEntry.level).toBe('warn');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });

  it('applies humanized strings and enforces structural invariants on success', async () => {
    const humanized = {
      ...SAMPLE_FINAL,
      refinedQuestion: 'Does Team A win the 2026 finals?',
      outcomes: [
        // Model drifted on a name — must be restored from the original.
        { name: 'TEAM A (GOATS)', winCondition: 'Team A is the champion.', resolutionCriteria: 'Official box score names Team A.' },
        { name: 'Team B', winCondition: 'Team B is the champion.', resolutionCriteria: 'Official box score names Team B.' },
        { name: 'Other / None', winCondition: 'Neither listed team wins.', resolutionCriteria: 'Official box score shows no listed team.' },
      ],
      // Model drifted on a timestamp — must also be restored.
      marketStartTimeUTC: '1999-01-01T00:00:00Z',
      shortDescription: 'Tracks the 2026 finals winner.',
    };
    const query = vi.fn().mockResolvedValue({
      content: '```json\n' + JSON.stringify(humanized) + '\n```',
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      wallClockMs: 120,
    });

    const result = await humanizeFinalJson('m', SAMPLE_FINAL, { queryModel: query });

    expect(result.logEntry.level).toBe('info');
    expect(result.humanizedJson.shortDescription).toBe('Tracks the 2026 finals winner.');
    expect(result.humanizedJson.refinedQuestion).toBe(SAMPLE_FINAL.refinedQuestion);
    expect(result.humanizedJson.outcomes).toEqual(SAMPLE_FINAL.outcomes);
    expect(result.humanizedJson.marketStartTimeUTC).toBe(SAMPLE_FINAL.marketStartTimeUTC);
    expect(result.humanizedJson.marketEndTimeUTC).toBe(SAMPLE_FINAL.marketEndTimeUTC);
  });

  it('logs a warning when the shortDescription drifts', async () => {
    const original = { ...SAMPLE_FINAL, shortDescription: 'Tracks https://example.com/boxscore for the finals.' };
    const query = vi.fn().mockResolvedValue({
      content: JSON.stringify({ ...original, shortDescription: 'Tracks the finals.' }),
      usage: { promptTokens: 50, completionTokens: 80, totalTokens: 130 },
      wallClockMs: 90,
    });

    const result = await humanizeFinalJson('m', original, { queryModel: query });

    expect(result.humanizedJson.shortDescription).toBe(original.shortDescription);
    expect(result.logEntry.level).toBe('warn');
    expect(result.logEntry.message).toMatch(/shortDescription/);
  });
});
