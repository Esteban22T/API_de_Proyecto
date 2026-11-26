function isPositiveInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return false;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveIntNumber(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value) {
  return (
    typeof value === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function validateRequiredText(errors, value, fieldName, maxLength) {
  if (!isNonEmptyString(value)) {
    errors.push(`${fieldName} es obligatorio y debe ser un texto no vacío.`);
    return;
  }

  if (value.trim().length > maxLength) {
    errors.push(`${fieldName} no puede superar los ${maxLength} caracteres.`);
  }
}

function validateOptionalText(errors, value, fieldName, maxLength) {
  if (!isOptionalString(value)) {
    errors.push(`${fieldName} debe ser un texto o null.`);
    return;
  }

  if (typeof value === 'string' && value.trim().length > maxLength) {
    errors.push(`${fieldName} no puede superar los ${maxLength} caracteres.`);
  }
}

module.exports = {
  isPositiveInt,
  isNonEmptyString,
  isNonNegativeNumber,
  isPositiveIntNumber,
  isPlainObject,
  isOptionalString,
  normalizeOptionalString,
  isValidEmail,
  validateRequiredText,
  validateOptionalText,
};
