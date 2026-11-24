const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidId, validateUser } = require('./validation');

test('accepts a user with valid fields', () => {
  assert.equal(
    validateUser({ name: 'Ana', email: 'ana@gmail.com', age: 25 }),
    null,
  );
});

test('rejects invalid email and age with specific messages', () => {
  assert.equal(
    validateUser({ name: 'Ana', email: 'ana.gmail.com', age: 25 }),
    'Ingresa un correo válido.',
  );
  assert.equal(
    validateUser({ name: 'Ana', email: 'ana@gmail.com', age: '25' }),
    'La edad debe ser un número entero mayor o igual a cero.',
  );
});

test('accepts only positive integer ids', () => {
  assert.equal(isValidId('123'), true);
  assert.equal(isValidId('0'), false);
  assert.equal(isValidId('abc'), false);
});
