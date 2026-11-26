const {
  isPlainObject,
  validateRequiredText,
} = require('../../utils/validators');

/**
 * Validates request payload for creating a metodo de pago.
 * @param {unknown} body
 * @returns {string[]}
 */
function validateMetodoPago(body) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];
  validateRequiredText(errors, body.nombre, 'nombre', 40);
  return errors;
}

module.exports = { validateMetodoPago };
