const {
  isNonEmptyString,
  isNonNegativeNumber,
  isPositiveIntNumber,
} = require('../../utils/validators');

function validateServicio(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];

  if (!isNonEmptyString(body.nombre)) {
    errors.push('nombre es obligatorio y debe ser un texto no vacío.');
  } else if (body.nombre.trim().length > 80) {
    errors.push('nombre no puede superar los 80 caracteres.');
  }

  if (!isNonNegativeNumber(body.precio)) {
    errors.push('precio es obligatorio y debe ser un número finito mayor o igual a 0.');
  }

  if (!isPositiveIntNumber(body.duracionEstimada)) {
    errors.push('duracionEstimada es obligatorio y debe ser un entero mayor a 0.');
  }

  if (body.activo !== undefined && typeof body.activo !== 'boolean') {
    errors.push('activo debe ser un booleano.');
  }

  return errors;
}

module.exports = { validateServicio };
