import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LLMLoadingState from './LLMLoadingState.jsx';

const META = { models: ['gpt-test'], startTime: Date.now() };

describe('LLMLoadingState', () => {
  it('renders phase, model, and elapsed state without an output-style chip', () => {
    const html = renderToStaticMarkup(
      <LLMLoadingState phase="draft" meta={META} />,
    );
    expect(html).toContain('Drafting market proposal');
    expect(html).toContain('gpt-test');
    expect(html).not.toContain('llm-loading__rigor');
  });
});
