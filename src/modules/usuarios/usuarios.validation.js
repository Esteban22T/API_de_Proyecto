const {
  isPlainObject,
  isNonEmptyString,
  isValidEmail,
  validateRequiredText,
  validateOptionalText,
} = require('../../utils/validators');

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 100;

function validatePassword(errors, password, isUpdate) {
  if (password === undefined || (isUpdate && password === null)) {
    if (!isUpdate) {
      errors.push('password es obligatorio y debe ser un texto no vacío.');
    }
    return;
  }

  if (typeof password !== 'string' || password.trim().length === 0) {
    errors.push('password debe ser un texto no vacío.');
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(
      `password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    );
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(
      `password no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`
    );
  }
}

function validateRoles(errors, roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    errors.push('roles es obligatorio y debe ser un arreglo con al menos un rol.');
    return;
  }

  const hasInvalidRole = roles.some(
    (role) => !isNonEmptyString(role) || role.trim().length > 30
  );
  if (hasInvalidRole) {
    errors.push(
      'Cada rol debe ser un texto no vacío de máximo 30 caracteres.'
    );
  }
}

/**
 * Validates request payload for creating or updating a usuario.
 * @param {unknown} body
 * @param {{ isUpdate?: boolean }} [options]
 * @returns {string[]}
 */
function validateUsuario(body, { isUpdate = false } = {}) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];

  validateRequiredText(errors, body.primerNombre, 'primerNombre', 40);
  validateOptionalText(errors, body.segundoNombre, 'segundoNombre', 40);
  validateRequiredText(errors, body.primerApellido, 'primerApellido', 40);
  validateOptionalText(errors, body.segundoApellido, 'segundoApellido', 40);
  validateOptionalText(errors, body.telefono, 'telefono', 20);
  validateOptionalText(errors, body.especialidad, 'especialidad', 60);

  if (!isNonEmptyString(body.email)) {
    errors.push('email es obligatorio y debe ser un texto no vacío.');
  } else if (body.email.trim().length > 100) {
    errors.push('email no puede superar los 100 caracteres.');
  } else if (!isValidEmail(body.email)) {
    errors.push('email no tiene un formato válido.');
  }

  validatePassword(errors, body.password, isUpdate);
  validateRoles(errors, body.roles);

  if (body.activo !== undefined && typeof body.activo !== 'boolean') {
    errors.push('activo debe ser un booleano.');
  }

  return errors;
}

module.exports = { validateUsuario };
