import { describe, expect, it } from "vitest";
import {
  buildCompactedResolutionDescription,
  buildResolutionDescriptionMarkdown,
  compactResolutionDescriptionMarkdown,
  isStandardResolutionDescription,
} from "./resolutionDescription.js";

const FINAL_JSON = {
  refinedQuestion:
    "Will Example FC win the Singapore Cup final at National Stadium on 2026-12-14?",
  marketStartTimeUTC: "2026-12-01T00:00:00Z",
  marketEndTimeUTC: "2026-12-14T14:00:00Z",
  outcomes: [
    {
      name: "Example FC",
      resolutionCriteria: "Use the official match centre result.",
    },
  ],
  fullResolutionRules:
    "1. Use https://example.com/match-centre?match=42 for the final score. 2. Cross-check at https://mirror.example.org/scores. 3. Ignore friendlies.",
  edgeCases:
    "1. Abandoned match before full time resolves Other / None. 2. Match rescheduled past the end timestamp resolves Other / None.",
};

describe("buildResolutionDescriptionMarkdown", () => {
  it("preserves a model-provided standard description verbatim", () => {
    const markdown = [
      "## Summary",
      "Example FC wins the Singapore Cup final at the UTC index timestamp 2026-12-14T14:00:00Z.",
      "",
      "## Criteria",
      "Example FC must win at National Stadium by the UTC timestamp.",
      "",
      "## Resolution Source",
      "- Primary source: [match page](https://example.com/match-centre?match=42); set the match filter to final.",
      "- Secondary source: [league page](https://stats.example.org/cup-final); used if the primary is unavailable.",
      "",
      "## Additional Information",
      "Exclude friendlies. Resolution window: resolved within 24 hours after the index timestamp.",
      "",
      "---",
      "_Language: en_",
    ].join("\n");

    expect(
      buildResolutionDescriptionMarkdown({
        ...FINAL_JSON,
        resolutionDescriptionMarkdown: markdown,
      }),
    ).toBe(markdown);
    expect(isStandardResolutionDescription(markdown)).toBe(true);
  });

  it("builds the four-section dashboard description from final JSON", () => {
    const markdown = buildResolutionDescriptionMarkdown(FINAL_JSON);

    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("Example FC win the Singapore Cup final");
    expect(markdown).toContain("2026-12-14T14:00:00Z");

    expect(markdown).toContain("## Criteria");
    // Criteria is bulleted full-sentences, including a final
    // eligible-read-window bullet.
    expect(markdown).toMatch(
      /- The eligible read window runs from 2026-12-01T00:00:00Z through 2026-12-14T14:00:00Z UTC\./,
    );
    // Each rule from fullResolutionRules renders as its own bullet.
    expect(markdown).toMatch(/- Use the linked source for the final score\./);
    expect(markdown).toMatch(/- Cross-check at the linked source\./);
    expect(markdown).toMatch(/- Ignore friendlies\./);

    expect(markdown).toContain("## Resolution Source");
    expect(markdown).toContain("- Primary source: [example.com](https://example.com/match-centre?match=42)");
    expect(markdown).toContain("- Secondary source: [mirror.example.org](https://mirror.example.org/scores)");
    // No "— host" middle bit on the Source line; host appears only as the link label.
    expect(markdown).not.toMatch(/- Primary source — /);
    expect(markdown).not.toMatch(/- Secondary source — /);
    expect(markdown).not.toContain("Use https://");
    // The verify-source reminder is UI-only and must NOT appear in the
    // markdown — it would otherwise ship to 42.space's ancillary data.
    expect(markdown).not.toMatch(/Manually verify each link/);
    expect(markdown).not.toMatch(/AI-proposed URLs can 404/);

    expect(markdown).toContain("## Additional Information");
    expect(markdown).toContain(
      "resolved within 24 hours after the index timestamp 2026-12-14T14:00:00Z",
    );
    expect(markdown).toContain("_Language: en_");

    // Section ordering is fixed.
    const summaryIdx = markdown.indexOf("## Summary");
    const criteriaIdx = markdown.indexOf("## Criteria");
    const sourceIdx = markdown.indexOf("## Resolution Source");
    const additionalIdx = markdown.indexOf("## Additional Information");
    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(summaryIdx).toBeLessThan(criteriaIdx);
    expect(criteriaIdx).toBeLessThan(sourceIdx);
    expect(sourceIdx).toBeLessThan(additionalIdx);
  });

  it("omits the secondary-source line entirely when only one URL is present", () => {
    const markdown = buildResolutionDescriptionMarkdown({
      ...FINAL_JSON,
      fullResolutionRules:
        "1. Use https://example.com/match-centre?match=42 for the final score.",
    });

    expect(markdown).toContain("- Primary source: [example.com](https://example.com/match-centre?match=42)");
    // No placeholder noise — the secondary line should simply not appear.
    expect(markdown).not.toMatch(/Secondary source/);
    expect(markdown).not.toMatch(/substantively different public-read fallback/);
  });

  it("falls back clearly when no external URL was emitted (no secondary placeholder either)", () => {
    const markdown = buildResolutionDescriptionMarkdown({
      ...FINAL_JSON,
      fullResolutionRules:
        "1. Use the official match centre for the final score.",
    });

    expect(markdown).toContain(
      "- Primary source: add the external URL before dashboard submission",
    );
    expect(markdown).not.toMatch(/Secondary source/);
    expect(markdown).not.toMatch(/substantively different public-read fallback/);
  });

  it("renders Additional Information as bulleted succinct sentences", () => {
    const markdown = buildResolutionDescriptionMarkdown(FINAL_JSON);

    // Each edge case becomes its own bullet line.
    expect(markdown).toMatch(
      /- Abandoned match before full time resolves Other \/ None\./,
    );
    expect(markdown).toMatch(
      /- Match rescheduled past the end timestamp resolves Other \/ None\./,
    );
    // Resolution-window bullet is always appended.
    expect(markdown).toMatch(
      /- Resolution window: resolved within 24 hours after the index timestamp 2026-12-14T14:00:00Z\./,
    );
    // The old single-paragraph form must NOT appear.
    expect(markdown).not.toMatch(
      /Apply listed edge cases and exclusions, including:/,
    );
  });

  it("skips XML / RSS / Atom URLs and falls through to the next eligible source", () => {
    const markdown = buildResolutionDescriptionMarkdown({
      ...FINAL_JSON,
      fullResolutionRules:
        "1. Use https://feed.example.com/results.xml for the score. 2. Fallback at https://results.example.org/match/42 for confirmation.",
    });

    // The .xml feed must be filtered out; the HTML fallback becomes primary.
    expect(markdown).not.toContain("results.xml");
    expect(markdown).not.toContain("feed.example.com");
    expect(markdown).toContain("- Primary source: [results.example.org](https://results.example.org/match/42)");
  });

  it("skips RSS / Atom paths and feed-format query params too", () => {
    const markdown = buildResolutionDescriptionMarkdown({
      ...FINAL_JSON,
      fullResolutionRules:
        "1. https://news.example.com/rss/finals 2. https://api.example.org/scores?format=xml 3. https://canonical.example.net/match/42",
    });

    expect(markdown).not.toContain("/rss/");
    expect(markdown).not.toContain("format=xml");
    expect(markdown).toContain("- Primary source: [canonical.example.net](https://canonical.example.net/match/42)");
  });

  it("emits the placeholder + reminder when every harvested URL is XML/RSS", () => {
    const markdown = buildResolutionDescriptionMarkdown({
      ...FINAL_JSON,
      fullResolutionRules:
        "1. https://only.example.com/feed.xml 2. https://other.example.org/atom",
    });

    expect(markdown).toContain(
      "- Primary source: add the external URL before dashboard submission",
    );
    expect(markdown).not.toContain("feed.example");
    expect(markdown).not.toMatch(/Manually verify each link/);
  });

  it("falls back to a single edge-case bullet when no edge cases are provided", () => {
    const markdown = buildResolutionDescriptionMarkdown({
      ...FINAL_JSON,
      edgeCases: "",
    });

    expect(markdown).toMatch(
      /- Apply the listed edge cases; ignore unofficial, out-of-window, or later-corrected values unless the rules state otherwise\./,
    );
    expect(markdown).toMatch(/- Resolution window:/);
  });
});

describe("compactResolutionDescriptionMarkdown", () => {
  it('encodes newlines as \\n and double quotes as \\"', () => {
    const markdown = [
      "## Summary",
      'This market resolves to the range of the "Close" price for BTC/USDT.',
      "",
      "## Criteria",
      'Read the Binance "1m" Close price at the UTC index timestamp.',
      "",
      "## Resolution Source",
      "Primary source — Binance: [Binance](https://www.binance.com/en/trade/BTC_USDT?type=spot).",
      "",
      "## Additional Information",
      "Resolved within 24 hours after the index timestamp.",
      "",
      "---",
      "_Language: en_",
    ].join("\n");

    const compact = compactResolutionDescriptionMarkdown(markdown);

    expect(compact).not.toContain("\n");
    expect(compact).toContain("\\n## Criteria");
    expect(compact).toContain("\\n## Resolution Source");
    expect(compact).toContain('\\"Close\\"');
    expect(compact.endsWith("\\n_Language: en_")).toBe(true);
    expect(compact.startsWith("## Summary")).toBe(true);
  });

  it("collapses multiple blank lines and trims surrounding whitespace", () => {
    const markdown =
      "\n\n## Summary\nA.\n\n\n\n## Criteria\nB.\n\n## Resolution Source\nC.\n\n## Additional Information\nD.\n\n---\n_Language: en_\n\n";
    const compact = compactResolutionDescriptionMarkdown(markdown);

    // Exactly one \n\n between sections, never \n\n\n.
    expect(compact).not.toMatch(/\\n\\n\\n/);
    expect(compact.startsWith("## Summary")).toBe(true);
    expect(compact.endsWith("_Language: en_")).toBe(true);
  });

  it("returns a JSON-safe string that round-trips back to the standard markdown", () => {
    const compact = buildCompactedResolutionDescription(FINAL_JSON);
    const roundTripped = JSON.parse(`"${compact}"`);

    expect(isStandardResolutionDescription(roundTripped)).toBe(true);
    expect(roundTripped).toBe(buildResolutionDescriptionMarkdown(FINAL_JSON));
  });

  it("returns empty string for empty or non-string input", () => {
    expect(compactResolutionDescriptionMarkdown("")).toBe("");
    expect(compactResolutionDescriptionMarkdown("   \n   \n  ")).toBe("");
    expect(compactResolutionDescriptionMarkdown(null)).toBe("");
    expect(compactResolutionDescriptionMarkdown(undefined)).toBe("");
  });
});
