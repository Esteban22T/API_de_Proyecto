const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validateUser(body) {
  if (body === null || typeof body !== 'object') {
    return 'El cuerpo de la solicitud debe ser un objeto JSON.';
  }

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return 'El nombre es obligatorio.';
  }

  if (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim())) {
    return 'Ingresa un correo válido.';
  }

  if (!Number.isInteger(body.age) || body.age < 0) {
    return 'La edad debe ser un número entero mayor o igual a cero.';
  }

  return null;
}

function isValidId(id) {
  return /^[1-9]\d*$/.test(id);
}

module.exports = { isValidId, validateUser };
