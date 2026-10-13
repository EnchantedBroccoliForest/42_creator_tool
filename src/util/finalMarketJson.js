function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasReservedOutcomeTokenPrefix(name) {
  return typeof name === 'string' && name.trim().startsWith('OT');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Structural check on the finalizer output. Fails closed: unparseable
 * finalizer output (the `{ raw }` fallback) and JSON missing the fields a
 * market needs are both invalid, so neither can be marked complete.
 */
export function validateFinalMarketJson(finalJson) {
  if (!isPlainObject(finalJson)) {
    return { valid: false, errors: ['final market JSON must be an object'] };
  }
  if ('raw' in finalJson) {
    return { valid: false, errors: ['finalizer output was not valid JSON'] };
  }

  const errors = [];
  if (!isNonEmptyString(finalJson.refinedQuestion)) {
    errors.push('refinedQuestion must be a non-empty string');
  }
  if (!Array.isArray(finalJson.outcomes) || finalJson.outcomes.length < 2) {
    errors.push('outcomes must be an array with at least two entries');
  } else {
    const seen = new Set();
    finalJson.outcomes.forEach((outcome, index) => {
      if (!isPlainObject(outcome) || !isNonEmptyString(outcome.name)) {
        errors.push(`outcomes[${index}].name must be a non-empty string`);
        return;
      }
      if (hasReservedOutcomeTokenPrefix(outcome.name)) {
        errors.push(`outcomes[${index}].name must not begin with reserved "OT" token prefix`);
      }
      const key = outcome.name.trim().toLowerCase();
      if (seen.has(key)) errors.push(`outcomes[${index}].name duplicates an earlier outcome`);
      seen.add(key);
      if (!isNonEmptyString(outcome.winCondition)) {
        errors.push(`outcomes[${index}].winCondition must be a non-empty string`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
