const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const OFFSET_DATE_TIME_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function toIsoWithoutMillis(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function normalizeUtcDateTime(value, fallbackTime = '00:00:00') {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  if (DATE_ONLY_RE.test(raw)) {
    return toIsoWithoutMillis(new Date(`${raw}T${fallbackTime}Z`));
  }

  if (LOCAL_DATE_TIME_RE.test(raw)) {
    const withSeconds = raw.length === 16 ? `${raw}:00` : raw;
    return toIsoWithoutMillis(new Date(`${withSeconds}Z`));
  }

  if (OFFSET_DATE_TIME_RE.test(raw)) {
    return toIsoWithoutMillis(new Date(raw));
  }

  return '';
}

export function toDateInputValue(value, fallbackTime = '00:00:00') {
  const iso = normalizeUtcDateTime(value, fallbackTime);
  return iso ? iso.slice(0, 10) : '';
}

// Validation errors are returned as stable codes (not English strings) so
// the UI layer can translate them at render time. See `validation.*` keys
// in src/i18n.js for the rendered text.
export const VALIDATION_ERRORS = {
  QUESTION_REQUIRED: 'validation.question.required',
  START_REQUIRED: 'validation.startDate.required',
  START_INVALID: 'validation.startDate.invalid',
  START_PAST: 'validation.startDate.past',
  END_REQUIRED: 'validation.endDate.required',
  END_INVALID: 'validation.endDate.invalid',
  END_BEFORE_START: 'validation.endDate.beforeStart',
};

export function validateDraftInputs(input, now = Date.now()) {
  const question = typeof input?.question === 'string' ? input.question.trim() : '';
  const startRaw = typeof input?.startDate === 'string' ? input.startDate.trim() : '';
  const endRaw = typeof input?.endDate === 'string' ? input.endDate.trim() : '';
  const startDateUTC = normalizeUtcDateTime(startRaw, '00:00:00');
  const endDateUTC = normalizeUtcDateTime(endRaw, '23:59:59');
  const errors = {};

  if (!question) {
    errors.question = VALIDATION_ERRORS.QUESTION_REQUIRED;
  }

  if (!startRaw) {
    errors.startDate = VALIDATION_ERRORS.START_REQUIRED;
  } else if (!startDateUTC) {
    errors.startDate = VALIDATION_ERRORS.START_INVALID;
  } else {
    // Reject only dates strictly before today (UTC). The form defaults
    // startDate to today's date, so a "today" value must remain valid
    // throughout the entire UTC day — comparing against `now` directly
    // would invalidate the default the moment 00:00 UTC has passed.
    const nowDate = new Date(now);
    const startOfTodayUtc = Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate(),
    );
    if (new Date(startDateUTC).getTime() < startOfTodayUtc) {
      errors.startDate = VALIDATION_ERRORS.START_PAST;
    }
  }

  if (!endRaw) {
    errors.endDate = VALIDATION_ERRORS.END_REQUIRED;
  } else if (!endDateUTC) {
    errors.endDate = VALIDATION_ERRORS.END_INVALID;
  }

  if (startDateUTC && endDateUTC) {
    const startMs = new Date(startDateUTC).getTime();
    const endMs = new Date(endDateUTC).getTime();
    if (endMs <= startMs) {
      errors.endDate = VALIDATION_ERRORS.END_BEFORE_START;
    }
  }

  return {
    errors,
    startDateUTC,
    endDateUTC,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validateDatePair(startDate, endDate, now = Date.now()) {
  const result = validateDraftInputs({
    question: 'placeholder',
    startDate,
    endDate,
  }, now);

  const errors = { ...result.errors };
  if (!startDate) delete errors.startDate;
  if (!endDate) delete errors.endDate;
  return errors.startDate || errors.endDate || null;
}
