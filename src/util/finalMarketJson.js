import {
  buildResolutionDescriptionMarkdown,
  isStandardResolutionDescription,
} from './resolutionDescription.js';

export const FINAL_PAYLOAD_MAX_BYTES = 30 * 1024;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasReservedOutcomeTokenPrefix(name) {
  return typeof name === 'string' && name.trim().startsWith('OT');
}

function payloadByteLength(value) {
  const payload = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload).length;
  }
  return payload.length;
}

function normalizeMarkdown(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    : '';
}

export function prepareFinalMarketPayload(finalJson, options = {}) {
  if (!isPlainObject(finalJson) || 'raw' in finalJson) {
    return finalJson;
  }

  const description = normalizeMarkdown(
    buildResolutionDescriptionMarkdown(finalJson, { language: options.language }),
  );
  const prepared = {
    ...finalJson,
    description,
    whitelisted: true,
  };
  delete prepared.resolutionDescriptionMarkdown;
  delete prepared.descriptionMarkdown;
  delete prepared.isEarlyResolution;

  if (typeof finalJson.is_early_resolution === 'boolean') {
    prepared.is_early_resolution = finalJson.is_early_resolution;
  } else if (typeof finalJson.isEarlyResolution === 'boolean') {
    prepared.is_early_resolution = finalJson.isEarlyResolution;
  } else if (typeof options.isEarlyResolution === 'boolean') {
    prepared.is_early_resolution = options.isEarlyResolution;
  }

  return prepared;
}

export function validateFinalMarketJson(finalJson) {
  if (!isPlainObject(finalJson) || 'raw' in finalJson) {
    return {
      valid: false,
      errors: ['finalizer output must be structured JSON, not raw text'],
    };
  }

  const errors = [];
  if (!Array.isArray(finalJson.outcomes) || finalJson.outcomes.length < 2) {
    errors.push('outcomes must contain at least two named Outcome Tokens');
  } else {
    finalJson.outcomes.forEach((outcome, index) => {
      const name = typeof outcome?.name === 'string' ? outcome.name.trim() : '';
      if (!name) {
        errors.push(`outcomes[${index}].name is required`);
      }
      if (hasReservedOutcomeTokenPrefix(outcome?.name)) {
        errors.push(`outcomes[${index}].name must not begin with reserved "OT" token prefix`);
      }
    });
  }

  const description = normalizeMarkdown(finalJson.description);
  if (!description) {
    errors.push('description is required for the compacted ancillary payload');
  } else {
    if (!isStandardResolutionDescription(description)) {
      errors.push('description must follow the 42 resolution markdown standard');
    }
    if (/\r/.test(finalJson.description)) {
      errors.push('description must use JSON-safe \\n newlines, not carriage returns');
    }
  }

  if (typeof finalJson.is_early_resolution !== 'boolean') {
    errors.push('is_early_resolution must be a boolean');
  }

  if (finalJson.whitelisted !== true) {
    errors.push('whitelisted must be true');
  }

  const bytes = payloadByteLength(finalJson);
  if (bytes > FINAL_PAYLOAD_MAX_BYTES) {
    errors.push(`payload must not exceed 30KB (${bytes} bytes)`);
  }

  return { valid: errors.length === 0, errors };
}
