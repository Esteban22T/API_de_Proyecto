const express = require('express');
const pool = require('../../config/db');
const { isPositiveInt } = require('../../utils/validators');
const {
  validateCreatePago,
  validateAbono,
  validatePagoFilters,
} = require('./pagos.validation');

const router = express.Router();

const pagoResumenBaseQuery = `
  WITH pago_resumen AS (
    SELECT
      p.id,
      p.cita_id AS "citaId",
      p.fecha,
      json_build_object(
        'id', cl.id,
        'primerNombre', cl.primer_nombre,
        'segundoNombre', cl.segundo_nombre,
        'primerApellido', cl.primer_apellido,
        'segundoApellido', cl.segundo_apellido,
        'telefono', cl.telefono,
        'email', cl.email
      ) AS cliente,
      COALESCE(cs_tot.total_cita, 0)::numeric(12, 2) AS total_cita,
      COALESCE(dp_tot.total_abonado, 0)::numeric(12, 2) AS total_abonado,
      COALESCE(dp_tot.abonos, '[]'::json) AS abonos
    FROM pago p
    INNER JOIN cita c ON c.id = p.cita_id
    INNER JOIN cliente cl ON cl.id = c.cliente_id
    LEFT JOIN (
      SELECT
        cita_id,
        SUM(precio_aplicado) AS total_cita
      FROM cita_servicio
      GROUP BY cita_id
    ) cs_tot ON cs_tot.cita_id = p.cita_id
    LEFT JOIN (
      SELECT
        dp.pago_id,
        SUM(dp.monto) AS total_abonado,
        JSON_AGG(
          json_build_object(
            'id', dp.id,
            'metodoPagoId', dp.metodo_pago_id,
            'metodoPagoNombre', mp.nombre,
            'monto', dp.monto,
            'fecha', dp.fecha
          )
          ORDER BY dp.fecha, dp.id
        ) AS abonos
      FROM detalle_pago dp
      INNER JOIN metodo_pago mp ON mp.id = dp.metodo_pago_id
      GROUP BY dp.pago_id
    ) dp_tot ON dp_tot.pago_id = p.id
  )
  SELECT
    id,
    "citaId",
    fecha,
    cliente,
    total_cita AS "totalCita",
    total_abonado AS "totalAbonado",
    GREATEST(0, total_cita - total_abonado)::numeric(12, 2) AS "saldoPendiente",
    CASE
      WHEN total_abonado > total_cita THEN 'Excedido'
      WHEN total_abonado = total_cita THEN 'Pagado'
      WHEN total_abonado > 0 THEN 'Parcial'
      ELSE 'Pendiente'
    END AS "estadoPago",
    abonos
  FROM pago_resumen
`;

function parsePositiveParam(req, res, paramName, label) {
  if (!isPositiveInt(req.params[paramName])) {
    res.status(400).json({ error: `El ${label} debe ser un entero positivo.` });
    return null;
  }

  return Number(req.params[paramName]);
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function createHttpError(status, body) {
  const error = new Error(body.error);
  error.status = status;
  error.body = body;
  return error;
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findPagoById(db, id) {
  const result = await db.query(
    `${pagoResumenBaseQuery}
     WHERE id = $1`,
    [id]
  );
  return result.rowCount === 0 ? null : result.rows[0];
}

async function findPagoByCitaId(db, citaId) {
  const result = await db.query(
    `${pagoResumenBaseQuery}
     WHERE "citaId" = $1`,
    [citaId]
  );
  return result.rowCount === 0 ? null : result.rows[0];
}

async function validateMetodosPagoExist(client, metodoPagoIds) {
  const uniqueIds = [...new Set(metodoPagoIds)];
  const result = await client.query(
    `SELECT id FROM metodo_pago WHERE id = ANY($1::int[])`,
    [uniqueIds]
  );

  if (result.rowCount !== uniqueIds.length) {
    const foundIds = new Set(result.rows.map((row) => row.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: [`Método(s) de pago inexistente(s): ${missing.join(', ')}.`],
    });
  }
}

async function getCitaTotalCents(client, citaId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(precio_aplicado), 0)::numeric(12, 2) AS "totalCita"
     FROM cita_servicio
     WHERE cita_id = $1`,
    [citaId]
  );
  return toCents(result.rows[0].totalCita);
}

async function getPagoAbonadoCents(client, pagoId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(monto), 0)::numeric(12, 2) AS "totalAbonado"
     FROM detalle_pago
     WHERE pago_id = $1`,
    [pagoId]
  );
  return toCents(result.rows[0].totalAbonado);
}

async function addAbonoToPago(client, pago, body) {
  await validateMetodosPagoExist(client, [body.metodoPagoId]);

  const totalCitaCents = await getCitaTotalCents(client, pago.citaId);
  const totalAbonadoCents = await getPagoAbonadoCents(client, pago.id);
  const saldoPendienteCents = Math.max(0, totalCitaCents - totalAbonadoCents);
  const montoCents = toCents(body.monto);

  if (montoCents > saldoPendienteCents) {
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: [
        'El monto del abono supera el saldo pendiente de la cita.',
      ],
    });
  }

  await client.query(
    `INSERT INTO detalle_pago (pago_id, metodo_pago_id, monto)
     VALUES ($1, $2, $3)`,
    [pago.id, body.metodoPagoId, body.monto]
  );

  return findPagoById(client, pago.id);
}

router.get('/', async (req, res) => {
  const filterErrors = validatePagoFilters(req.query);
  if (filterErrors.length > 0) {
    return res.status(400).json({
      error: 'Parámetros de consulta inválidos.',
      details: filterErrors,
    });
  }

  const conditions = [];
  const params = [];

  if (req.query.citaId !== undefined) {
    params.push(Number(req.query.citaId));
    conditions.push(`"citaId" = $${params.length}`);
  }

  if (req.query.estadoPago !== undefined) {
    params.push(req.query.estadoPago);
    conditions.push(`"estadoPago" = $${params.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `${pagoResumenBaseQuery}
     ${whereClause}
     ORDER BY fecha DESC, id DESC`,
    params
  );

  return res.status(200).json(result.rows);
});

router.get('/cita/:citaId', async (req, res) => {
  const citaId = parsePositiveParam(req, res, 'citaId', 'citaId');
  if (citaId === null) return;

  const pago = await findPagoByCitaId(pool, citaId);
  if (!pago) {
    return res
      .status(404)
      .json({ error: 'Pago no encontrado para la cita indicada.' });
  }

  return res.status(200).json(pago);
});

router.get('/:id', async (req, res) => {
  const id = parsePositiveParam(req, res, 'id', 'id');
  if (id === null) return;

  const pago = await findPagoById(pool, id);
  if (!pago) {
    return res.status(404).json({ error: 'Pago no encontrado.' });
  }

  return res.status(200).json(pago);
});

router.post('/', async (req, res) => {
  const errors = validateCreatePago(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const abonos = req.body.abonos || [];

  try {
    const createdPago = await withTransaction(async (client) => {
      const citaResult = await client.query(
        `SELECT id, estado FROM cita WHERE id = $1 FOR UPDATE`,
        [req.body.citaId]
      );

      if (citaResult.rowCount === 0) {
        throw createHttpError(400, {
          error: 'Datos inválidos.',
          details: [`La cita ${req.body.citaId} no existe.`],
        });
      }

      if (citaResult.rows[0].estado === 'Cancelada') {
        throw createHttpError(409, {
          error: 'No se puede registrar un pago para una cita cancelada.',
        });
      }

      const existingPago = await client.query(
        `SELECT id FROM pago WHERE cita_id = $1`,
        [req.body.citaId]
      );
      if (existingPago.rowCount > 0) {
        throw createHttpError(409, {
          error: 'La cita ya tiene un pago registrado.',
        });
      }

      if (abonos.length > 0) {
        await validateMetodosPagoExist(
          client,
          abonos.map((item) => item.metodoPagoId)
        );

        const totalCitaCents = await getCitaTotalCents(client, req.body.citaId);
        const totalAbonosCents = abonos.reduce(
          (sum, item) => sum + toCents(item.monto),
          0
        );

        if (totalAbonosCents > totalCitaCents) {
          throw createHttpError(400, {
            error: 'Datos inválidos.',
            details: [
              'El total de los abonos supera el saldo pendiente de la cita.',
            ],
          });
        }
      }

      const insertPagoResult = await client.query(
        `INSERT INTO pago (cita_id) VALUES ($1) RETURNING id`,
        [req.body.citaId]
      );
      const pagoId = insertPagoResult.rows[0].id;

      if (abonos.length > 0) {
        const metodoIds = abonos.map((item) => item.metodoPagoId);
        const montos = abonos.map((item) => item.monto);
        await client.query(
          `INSERT INTO detalle_pago (pago_id, metodo_pago_id, monto)
           SELECT $1, t.metodo_pago_id, t.monto
           FROM UNNEST($2::int[], $3::numeric(12, 2)[]) AS t(metodo_pago_id, monto)`,
          [pagoId, metodoIds, montos]
        );
      }

      return findPagoById(client, pagoId);
    });

    return res.status(201).json(createdPago);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'La cita ya tiene un pago registrado.' });
    }
    throw error;
  }
});

router.post('/cita/:citaId/abonos', async (req, res) => {
  const citaId = parsePositiveParam(req, res, 'citaId', 'citaId');
  if (citaId === null) return;

  const errors = validateAbono(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  try {
    const updatedPago = await withTransaction(async (client) => {
      const pagoResult = await client.query(
        `SELECT id, cita_id AS "citaId"
         FROM pago
         WHERE cita_id = $1
         FOR UPDATE`,
        [citaId]
      );

      if (pagoResult.rowCount === 0) {
        throw createHttpError(404, {
          error: 'Pago no encontrado para la cita indicada.',
        });
      }

      return addAbonoToPago(client, pagoResult.rows[0], req.body);
    });

    return res.status(201).json(updatedPago);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    throw error;
  }
});

router.post('/:id/abonos', async (req, res) => {
  const id = parsePositiveParam(req, res, 'id', 'id');
  if (id === null) return;

  const errors = validateAbono(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  try {
    const updatedPago = await withTransaction(async (client) => {
      const pagoResult = await client.query(
        `SELECT id, cita_id AS "citaId"
         FROM pago
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (pagoResult.rowCount === 0) {
        throw createHttpError(404, { error: 'Pago no encontrado.' });
      }

      return addAbonoToPago(client, pagoResult.rows[0], req.body);
    });

    return res.status(201).json(updatedPago);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    throw error;
  }
});

async function handleDeleteAbono(res, abonoId, pagoId = null) {
  try {
    const updatedPago = await withTransaction(async (client) => {
      const deleteResult = pagoId === null
        ? await client.query(
            `DELETE FROM detalle_pago
             WHERE id = $1
             RETURNING pago_id AS "pagoId"`,
            [abonoId]
          )
        : await client.query(
            `DELETE FROM detalle_pago
             WHERE id = $1 AND pago_id = $2
             RETURNING pago_id AS "pagoId"`,
            [abonoId, pagoId]
          );

      if (deleteResult.rowCount === 0) {
        throw createHttpError(404, { error: 'Abono no encontrado.' });
      }

      return findPagoById(client, deleteResult.rows[0].pagoId);
    });

    return res.status(200).json(updatedPago);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    throw error;
  }
}

router.delete('/abonos/:abonoId', async (req, res) => {
  const abonoId = parsePositiveParam(req, res, 'abonoId', 'abonoId');
  if (abonoId === null) return;

  return handleDeleteAbono(res, abonoId);
});

router.delete('/:id/abonos/:abonoId', async (req, res) => {
  const pagoId = parsePositiveParam(req, res, 'id', 'id');
  if (pagoId === null) return;

  const abonoId = parsePositiveParam(req, res, 'abonoId', 'abonoId');
  if (abonoId === null) return;

  return handleDeleteAbono(res, abonoId, pagoId);
});

module.exports = router;
