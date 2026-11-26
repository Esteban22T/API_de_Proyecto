const {
  isPlainObject,
  isPositiveInt,
  isPositiveIntNumber,
  isNonNegativeNumber,
  isOptionalString,
} = require('../../utils/validators');

const ESTADOS_CITA = ['Programada', 'En proceso', 'Completada', 'Cancelada'];

const ISO_TIMESTAMPTZ_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  return isValidCalendarDate(year, month, day);
}

function isValidIsoTimestampWithTz(value) {
  if (typeof value !== 'string' || !ISO_TIMESTAMPTZ_REGEX.test(value.trim())) {
    return false;
  }

  const trimmed = value.trim();
  const [datePart] = trimmed.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (!isValidCalendarDate(year, month, day)) {
    return false;
  }

  return Number.isFinite(Date.parse(trimmed));
}

function validateCitaServicioItem(errors, item, index) {
  const prefix = `servicios[${index}]`;

  if (!isPlainObject(item)) {
    errors.push(`${prefix} debe ser un objeto JSON.`);
    return;
  }

  if (!isPositiveIntNumber(item.servicioId)) {
    errors.push(`${prefix}.servicioId es obligatorio y debe ser un entero positivo.`);
  }

  if (!isPositiveIntNumber(item.empleadoId)) {
    errors.push(`${prefix}.empleadoId es obligatorio y debe ser un entero positivo.`);
  }

  if (
    item.duracionAplicada !== undefined &&
    item.duracionAplicada !== null &&
    !isPositiveIntNumber(item.duracionAplicada)
  ) {
    errors.push(`${prefix}.duracionAplicada debe ser un entero mayor a 0.`);
  }

  if (
    item.precioAplicado !== undefined &&
    item.precioAplicado !== null &&
    !isNonNegativeNumber(item.precioAplicado)
  ) {
    errors.push(
      `${prefix}.precioAplicado debe ser un número finito mayor o igual a 0.`
    );
  }

  const hasInicio =
    item.inicioPlanificado !== undefined && item.inicioPlanificado !== null;
  const hasFin =
    item.finPlanificado !== undefined && item.finPlanificado !== null;

  let inicioValid = false;
  let finValid = false;

  if (hasInicio) {
    if (!isValidIsoTimestampWithTz(item.inicioPlanificado)) {
      errors.push(
        `${prefix}.inicioPlanificado debe ser una fecha y hora ISO 8601 válida con zona horaria.`
      );
    } else {
      inicioValid = true;
    }
  }

  if (hasFin) {
    if (!isValidIsoTimestampWithTz(item.finPlanificado)) {
      errors.push(
        `${prefix}.finPlanificado debe ser una fecha y hora ISO 8601 válida con zona horaria.`
      );
    } else {
      finValid = true;
    }
  }

  if (
    inicioValid &&
    finValid &&
    Date.parse(item.finPlanificado.trim()) <=
      Date.parse(item.inicioPlanificado.trim())
  ) {
    errors.push(
      `${prefix}.finPlanificado debe ser mayor que inicioPlanificado.`
    );
  }
}

/**
 * Validates request payload for creating or updating a cita.
 * @param {unknown} body
 * @returns {string[]}
 */
function validateCita(body) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  const errors = [];

  if (!isPositiveIntNumber(body.clienteId)) {
    errors.push('clienteId es obligatorio y debe ser un entero positivo.');
  }

  if (!isValidIsoTimestampWithTz(body.fechaHoraInicio)) {
    errors.push(
      'fechaHoraInicio es obligatorio y debe ser una fecha y hora ISO 8601 válida con zona horaria.'
    );
  }

  if (
    body.estado !== undefined &&
    (typeof body.estado !== 'string' || !ESTADOS_CITA.includes(body.estado))
  ) {
    errors.push(
      `estado debe ser uno de: ${ESTADOS_CITA.join(', ')}.`
    );
  }

  if (!isOptionalString(body.observaciones)) {
    errors.push('observaciones debe ser un texto o null.');
  }

  if (!Array.isArray(body.servicios) || body.servicios.length === 0) {
    errors.push('servicios es obligatorio y debe incluir al menos un ítem.');
  } else {
    body.servicios.forEach((item, index) => {
      validateCitaServicioItem(errors, item, index);
    });
  }

  return errors;
}

/**
 * Validates request payload for PATCH /api/citas/:id/estado.
 * @param {unknown} body
 * @returns {string[]}
 */
function validateCitaEstado(body) {
  if (!isPlainObject(body)) {
    return ['El cuerpo de la solicitud debe ser un objeto JSON.'];
  }

  if (typeof body.estado !== 'string' || !ESTADOS_CITA.includes(body.estado)) {
    return [`estado es obligatorio y debe ser uno de: ${ESTADOS_CITA.join(', ')}.`];
  }

  return [];
}

/**
 * Validates optional query filters for GET /api/citas.
 * @param {Record<string, unknown>} query
 * @returns {string[]}
 */
function validateCitaFilters(query) {
  const errors = [];

  if (query.fecha !== undefined && !isValidDateOnly(query.fecha)) {
    errors.push('fecha debe tener formato YYYY-MM-DD válido.');
  }

  if (
    query.estado !== undefined &&
    (typeof query.estado !== 'string' || !ESTADOS_CITA.includes(query.estado))
  ) {
    errors.push(`estado debe ser uno de: ${ESTADOS_CITA.join(', ')}.`);
  }

  if (query.clienteId !== undefined && !isPositiveInt(query.clienteId)) {
    errors.push('clienteId debe ser un entero positivo.');
  }

  if (query.empleadoId !== undefined && !isPositiveInt(query.empleadoId)) {
    errors.push('empleadoId debe ser un entero positivo.');
  }

  return errors;
}

module.exports = {
  ESTADOS_CITA,
  validateCita,
  validateCitaEstado,
  validateCitaFilters,
};
