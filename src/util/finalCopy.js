// Verbose "full spec" clipboard text used by the final panel's secondary
// copy action.
export function formatFullSpecCopy(finalContent) {
  if (!finalContent || typeof finalContent !== 'object') return '';
  return [
    finalContent.refinedQuestion && `Question: ${finalContent.refinedQuestion}`,
    finalContent.shortDescription && `\nDescription: ${finalContent.shortDescription}`,
    `\nMarket Period: ${finalContent.marketStartTimeUTC} — ${finalContent.marketEndTimeUTC}`,
    finalContent.outcomes?.length > 0 && `\nOutcomes:\n${finalContent.outcomes.map((o, i) =>
      `${i + 1}. ${o.name}\n   Wins if: ${o.winCondition || 'N/A'}\n   Resolved by: ${o.resolutionCriteria}`
    ).join('\n')}`,
    finalContent.fullResolutionRules && `\nFull Resolution Rules:\n${finalContent.fullResolutionRules}`,
    finalContent.edgeCases && `\nEdge Cases:\n${finalContent.edgeCases}`,
  ].filter(Boolean).join('\n');
}
