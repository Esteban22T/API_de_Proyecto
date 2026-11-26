const {
  isPlainObject,
  isOptionalString,
  isValidEmail,
  validateRequiredText,
  validateOptionalText,
} = require('../../utils/validators');

/**
 * Validates request payload for creating or updating a cliente.
 * @param {unknown} body
 * @returns {string[]}
 */
function validateCliente(body) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];

  validateRequiredText(errors, body.primerNombre, 'primerNombre', 40);
  validateOptionalText(errors, body.segundoNombre, 'segundoNombre', 40);
  validateRequiredText(errors, body.primerApellido, 'primerApellido', 40);
  validateOptionalText(errors, body.segundoApellido, 'segundoApellido', 40);
  validateOptionalText(errors, body.telefono, 'telefono', 20);

  if (!isOptionalString(body.email)) {
    errors.push('email debe ser un texto o null.');
  } else if (typeof body.email === 'string' && body.email.trim().length > 0) {
    if (body.email.trim().length > 100) {
      errors.push('email no puede superar los 100 caracteres.');
    } else if (!isValidEmail(body.email)) {
      errors.push('email no tiene un formato válido.');
    }
  }

  if (body.activo !== undefined && typeof body.activo !== 'boolean') {
    errors.push('activo debe ser un booleano.');
  }

  return errors;
}

module.exports = { validateCliente };
