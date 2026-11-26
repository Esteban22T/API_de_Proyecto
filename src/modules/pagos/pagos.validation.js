const {
  isPlainObject,
  isPositiveInt,
  isPositiveIntNumber,
} = require('../../utils/validators');

const ESTADOS_PAGO = ['Pendiente', 'Parcial', 'Pagado', 'Excedido'];
const MAX_MONTO = 9999999999.99;

function isValidMonto(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return false;
  }

  if (value > MAX_MONTO) {
    return false;
  }

  // Ensure at most 2 decimal places so PostgreSQL NUMERIC(12, 2) never rounds below 0.01.
  return Math.round(value * 100) / 100 === value;
}

function validateAbonoItem(errors, item, prefix = '') {
  const label = prefix ? `${prefix}.` : '';

  if (!isPlainObject(item)) {
    errors.push(`${prefix || 'El abono'} debe ser un objeto JSON.`);
    return;
  }

  if (!isPositiveIntNumber(item.metodoPagoId)) {
    errors.push(
      `${label}metodoPagoId es obligatorio y debe ser un entero positivo.`
    );
  }

  if (!isValidMonto(item.monto)) {
    errors.push(
      `${label}monto es obligatorio y debe ser un número mayor a 0 con máximo 2 decimales.`
    );
  }
}

/**
 * Validates request payload for POST /api/pagos.
 * @param {unknown} body
 * @returns {string[]}
 */
function validateCreatePago(body) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];

  if (!isPositiveIntNumber(body.citaId)) {
    errors.push('citaId es obligatorio y debe ser un entero positivo.');
  }

  if (body.abonos !== undefined) {
    if (!Array.isArray(body.abonos)) {
      errors.push('abonos debe ser un arreglo de movimientos.');
    } else {
      body.abonos.forEach((item, index) => {
        validateAbonoItem(errors, item, `abonos[${index}]`);
      });
    }
  }

  return errors;
}

/**
 * Validates request payload for adding an abono to an existing pago.
 * @param {unknown} body
 * @returns {string[]}
 */
function validateAbono(body) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];
  validateAbonoItem(errors, body);
  return errors;
}

/**
 * Validates optional query filters for GET /api/pagos.
 * @param {Record<string, unknown>} query
 * @returns {string[]}
 */
function validatePagoFilters(query) {
  const errors = [];

  if (query.citaId !== undefined && !isPositiveInt(query.citaId)) {
    errors.push('citaId debe ser un entero positivo.');
  }

  if (
    query.estadoPago !== undefined &&
    (typeof query.estadoPago !== 'string' ||
      !ESTADOS_PAGO.includes(query.estadoPago))
  ) {
    errors.push(`estadoPago debe ser uno de: ${ESTADOS_PAGO.join(', ')}.`);
  }

  return errors;
}

module.exports = {
  ESTADOS_PAGO,
  validateCreatePago,
  validateAbono,
  validatePagoFilters,
};
