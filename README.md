# Backend CRUD de usuarios

API Node.js + Express conectada a PostgreSQL (Neon).

## Requisitos

- Node.js 20 o superior.
- Una base de datos PostgreSQL en Neon.

## Configuración local

Desde esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` y reemplaza `DATABASE_URL` por el string de conexión de Neon. No
compartas este archivo ni lo subas a Git; está excluido por `.gitignore`.
Usa el string con SSL que proporciona Neon, normalmente incluye
`?sslmode=require`.

Inicia la API:

```powershell
npm run dev
```

Al arrancar, el servidor crea la tabla `users` si todavía no existe. Comprueba
la conexión visitando `http://localhost:3000/health`.

## Rutas

- `GET /api/users`: devuelve una lista JSON de usuarios.
- `POST /api/users`: crea un usuario con `name`, `email` y `age`.
- `PUT /api/users/:id`: actualiza esos mismos campos.
- `DELETE /api/users/:id`: elimina el usuario.

El formato esperado para crear o actualizar es:

```json
{
  "name": "Ana",
  "email": "ana@gmail.com",
  "age": 25
}
```

Los errores de validación devuelven `400`; los IDs inexistentes devuelven `404`.
El borrado responde `200` para ser compatible con el cliente Flutter actual.

## Pruebas

```powershell
npm test
```

Estas pruebas validan los datos e IDs; para probar las rutas con PostgreSQL,
configura primero `DATABASE_URL` y ejecuta la API.

## Conectar Flutter durante desarrollo

Deja la API ejecutándose y, desde la carpeta Flutter, ejecuta:

```powershell
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/users
```

En un emulador Android, `localhost` apunta al emulador, no a tu PC. Usa
`http://10.0.2.2:3000/api/users` como dirección del servidor anfitrión. Para
un teléfono físico, usa la IP local de tu PC y asegúrate de que ambos estén en
la misma red. El permiso de HTTP sin cifrar solo está habilitado para la
configuración Android de depuración; en producción, usa la URL HTTPS del
backend desplegado.

La app conserva la URL anterior como valor predeterminado si no se proporciona
`API_BASE_URL`.

## Despliegue

Al desplegar en Render, configura `DATABASE_URL` en las variables de entorno
del servicio usando el string de Neon. No subas `.env`. El servicio escucha en
el puerto que Render proporciona mediante `PORT`.

La API no tiene autenticación. No la publiques con datos sensibles ni acceso
abierto de escritura sin añadir autenticación/autorización.
