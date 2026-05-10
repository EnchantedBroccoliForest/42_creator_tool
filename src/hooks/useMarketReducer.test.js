import { describe, it, expect } from 'vitest';
import { reducer, initialState } from './useMarketReducer.js';
import { DEFAULT_REVIEW_MODEL_IDS } from '../constants/models.js';

describe('review council defaults', () => {
  it('starts with Gemini 3 Pro and Claude Opus 4.5 as the default council', () => {
    expect(initialState.reviewModels).toEqual([
      'google/gemini-3-pro-preview',
      'anthropic/claude-opus-4.5',
    ]);
    expect(DEFAULT_REVIEW_MODEL_IDS).toEqual(initialState.reviewModels);
  });

  it('adds GPT-5.2 as the third reviewer when expanding the council', () => {
    const next = reducer(initialState, { type: 'ADD_REVIEW_MODEL' });

    expect(next.reviewModels).toEqual([
      'google/gemini-3-pro-preview',
      'anthropic/claude-opus-4.5',
      'openai/gpt-5.2',
    ]);
  });

  it('adds Claude Sonnet 4 as the fourth reviewer when expanding again', () => {
    const three = reducer(initialState, { type: 'ADD_REVIEW_MODEL' });
    const four = reducer(three, { type: 'ADD_REVIEW_MODEL' });

    expect(four.reviewModels).toEqual([
      'google/gemini-3-pro-preview',
      'anthropic/claude-opus-4.5',
      'openai/gpt-5.2',
      'anthropic/claude-sonnet-4',
    ]);
  });

  it('still allows the council to be reduced to one manual reviewer', () => {
    const next = reducer(initialState, { type: 'REMOVE_REVIEW_MODEL', index: 1 });

    expect(next.reviewModels).toEqual(['google/gemini-3-pro-preview']);
  });
});

describe('draft required-field touch state', () => {
  it('starts with required draft fields untouched', () => {
    expect(initialState.touchedFields).toEqual({
      question: false,
      startDate: false,
      endDate: false,
    });
  });

  it('marks one field touched', () => {
    const next = reducer(initialState, { type: 'TOUCH_FIELD', field: 'question' });

    expect(next.touchedFields.question).toBe(true);
    expect(next.touchedFields.startDate).toBe(false);
    expect(next.touchedFields.endDate).toBe(false);
  });

  it('marks all required draft fields touched', () => {
    const next = reducer(initialState, { type: 'TOUCH_DRAFT_REQUIRED_FIELDS' });

    expect(next.touchedFields).toEqual({
      question: true,
      startDate: true,
      endDate: true,
    });
  });

  it('SET_DATE_ERROR sets dateError without mutating dates or touched state', () => {
    const seeded = {
      ...initialState,
      startDate: '2026-06-01T10:00',
      endDate: '2026-06-30T23:30',
      touchedFields: { question: true, startDate: true, endDate: true },
    };
    const next = reducer(seeded, {
      type: 'SET_DATE_ERROR',
      dateError: 'End date and time must be later than Start.',
    });

    expect(next.dateError).toBe('End date and time must be later than Start.');
    expect(next.startDate).toBe('2026-06-01T10:00');
    expect(next.endDate).toBe('2026-06-30T23:30');
    expect(next.touchedFields).toEqual(seeded.touchedFields);
  });

  it('SET_DATE_ERROR with no dateError clears the field', () => {
    const seeded = { ...initialState, dateError: 'previous error' };
    const next = reducer(seeded, { type: 'SET_DATE_ERROR' });

    expect(next.dateError).toBeNull();
  });
});

describe('review lifecycle config', () => {
  const reviewConfig = {
    reviewModels: DEFAULT_REVIEW_MODEL_IDS,
    aggregationProtocol: 'majority',
  };

  it('stores the review configuration used for a successful review', () => {
    const next = reducer(initialState, {
      type: 'REVIEW_SUCCESS',
      reviews: [{ model: DEFAULT_REVIEW_MODEL_IDS[0], modelName: 'Reviewer', content: 'Looks good.' }],
      deliberatedReview: 'Council says update one thing.',
      reviewConfig,
    });

    expect(next.lastReviewConfig).toEqual(reviewConfig);
  });

  it('clears stale review configuration when a new draft is generated', () => {
    const reviewed = reducer(initialState, {
      type: 'REVIEW_SUCCESS',
      reviews: [{ model: DEFAULT_REVIEW_MODEL_IDS[0], modelName: 'Reviewer', content: 'Looks good.' }],
      reviewConfig,
    });
    const next = reducer(reviewed, { type: 'DRAFT_SUCCESS', content: 'fresh draft' });

    expect(next.reviews).toEqual([]);
    expect(next.lastReviewConfig).toBeNull();
  });

  it('clears stale review configuration when a pasted draft replaces the current draft', () => {
    const reviewed = reducer(initialState, {
      type: 'REVIEW_SUCCESS',
      reviews: [{ model: DEFAULT_REVIEW_MODEL_IDS[0], modelName: 'Reviewer', content: 'Looks good.' }],
      reviewConfig,
    });
    const next = reducer(reviewed, { type: 'SUBMIT_PASTED_DRAFT', content: 'pasted draft' });

    expect(next.reviews).toEqual([]);
    expect(next.lastReviewConfig).toBeNull();
  });
});
