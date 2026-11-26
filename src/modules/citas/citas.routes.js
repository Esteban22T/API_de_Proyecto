const express = require('express');
const pool = require('../../config/db');
const {
  isPositiveInt,
  normalizeOptionalString,
} = require('../../utils/validators');
const {
  validateCita,
  validateCitaEstado,
  validateCitaFilters,
} = require('./citas.validation');

const router = express.Router();

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Bogota';

const citaSelectQuery = `
  SELECT
    c.id,
    c.cliente_id AS "clienteId",
    json_build_object(
      'id', cl.id,
      'primerNombre', cl.primer_nombre,
      'segundoNombre', cl.segundo_nombre,
      'primerApellido', cl.primer_apellido,
      'segundoApellido', cl.segundo_apellido,
      'telefono', cl.telefono,
      'email', cl.email
    ) AS cliente,
    c.fecha_creacion AS "fechaCreacion",
    c.fecha_hora_inicio AS "fechaHoraInicio",
    c.estado,
    c.observaciones,
    COALESCE(SUM(cs.precio_aplicado), 0)::numeric(12, 2) AS "totalEstimado",
    COALESCE(
      JSON_AGG(
        json_build_object(
          'id', cs.id,
          'servicioId', cs.servicio_id,
          'servicioNombre', s.nombre,
          'empleadoId', cs.empleado_id,
          'empleadoNombre', CONCAT_WS(' ', u.primer_nombre, u.primer_apellido),
          'inicioPlanificado', cs.inicio_planificado,
          'finPlanificado', cs.fin_planificado,
          'duracionAplicada', cs.duracion_aplicada,
          'precioAplicado', cs.precio_aplicado
        )
        ORDER BY cs.inicio_planificado, cs.id
      ) FILTER (WHERE cs.id IS NOT NULL),
      '[]'::json
    ) AS servicios
  FROM cita c
  INNER JOIN cliente cl ON cl.id = c.cliente_id
  LEFT JOIN cita_servicio cs ON cs.cita_id = c.id
  LEFT JOIN servicio s ON s.id = cs.servicio_id
  LEFT JOIN usuario u ON u.id = cs.empleado_id
`;

function getId(req, res) {
  if (!isPositiveInt(req.params.id)) {
    res.status(400).json({ error: 'El id debe ser un entero positivo.' });
    return null;
  }

  return Number(req.params.id);
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

async function findCitaById(db, id) {
  const result = await db.query(
    `${citaSelectQuery}
     WHERE c.id = $1
     GROUP BY c.id, cl.id`,
    [id]
  );

  return result.rowCount === 0 ? null : result.rows[0];
}

async function validateAndLoadReferences(client, body, isUpdate) {
  const clienteResult = await client.query(
    `SELECT id, activo FROM cliente WHERE id = $1`,
    [body.clienteId]
  );

  if (clienteResult.rowCount === 0) {
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: [`El cliente ${body.clienteId} no existe.`],
    });
  }

  if (!isUpdate && !clienteResult.rows[0].activo) {
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: ['El cliente seleccionado está inactivo.'],
    });
  }

  const servicioIds = [...new Set(body.servicios.map((item) => item.servicioId))];
  const serviciosResult = await client.query(
    `SELECT id, nombre, precio, duracion_estimada AS "duracionEstimada", activo
     FROM servicio
     WHERE id = ANY($1::int[])`,
    [servicioIds]
  );
  const serviciosMap = new Map(
    serviciosResult.rows.map((row) => [row.id, row])
  );

  const empleadoIds = [
    ...new Set(body.servicios.map((item) => item.empleadoId)),
  ].sort((a, b) => a - b);

  // Lock referenced employee rows to serialize concurrent schedule checks for the same employee.
  const empleadosResult = await client.query(
    `SELECT id, primer_nombre AS "primerNombre", primer_apellido AS "primerApellido", activo
     FROM usuario
     WHERE id = ANY($1::int[])
     ORDER BY id
     FOR UPDATE`,
    [empleadoIds]
  );
  const empleadosMap = new Map(
    empleadosResult.rows.map((row) => [row.id, row])
  );

  const missingOrInactiveErrors = [];

  for (const servicioId of servicioIds) {
    const servicio = serviciosMap.get(servicioId);
    if (!servicio) {
      missingOrInactiveErrors.push(`El servicio ${servicioId} no existe.`);
    } else if (!isUpdate && !servicio.activo) {
      missingOrInactiveErrors.push(
        `El servicio "${servicio.nombre}" está inactivo.`
      );
    }
  }

  for (const empleadoId of empleadoIds) {
    const empleado = empleadosMap.get(empleadoId);
    if (!empleado) {
      missingOrInactiveErrors.push(`El empleado ${empleadoId} no existe.`);
    } else if (!isUpdate && !empleado.activo) {
      missingOrInactiveErrors.push(
        `El empleado "${empleado.primerNombre} ${empleado.primerApellido}" está inactivo.`
      );
    }
  }

  if (missingOrInactiveErrors.length > 0) {
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: missingOrInactiveErrors,
    });
  }

  return { serviciosMap, empleadosMap };
}

async function validateEmpleadoServicioAssignments(client, items, empleadosMap, serviciosMap) {
  const hasConfigResult = await client.query(
    `SELECT EXISTS (SELECT 1 FROM empleado_servicio) AS "hasConfig"`
  );

  if (!hasConfigResult.rows[0].hasConfig) {
    return;
  }

  const pairMap = new Map();
  for (const item of items) {
    pairMap.set(`${item.empleadoId}:${item.servicioId}`, {
      empleadoId: item.empleadoId,
      servicioId: item.servicioId,
    });
  }

  const pairs = [...pairMap.values()];
  const reqEmpleadoIds = pairs.map((p) => p.empleadoId);
  const reqServicioIds = pairs.map((p) => p.servicioId);

  const assignedResult = await client.query(
    `SELECT es.empleado_id AS "empleadoId", es.servicio_id AS "servicioId"
     FROM empleado_servicio es
     JOIN UNNEST($1::int[], $2::int[]) AS req(empleado_id, servicio_id)
       ON es.empleado_id = req.empleado_id AND es.servicio_id = req.servicio_id`,
    [reqEmpleadoIds, reqServicioIds]
  );

  const assignedKeys = new Set(
    assignedResult.rows.map((row) => `${row.empleadoId}:${row.servicioId}`)
  );

  const unassignedErrors = [];
  for (const [key, pair] of pairMap.entries()) {
    if (!assignedKeys.has(key)) {
      const emp = empleadosMap.get(pair.empleadoId);
      const srv = serviciosMap.get(pair.servicioId);
      unassignedErrors.push(
        `El empleado "${emp.primerNombre} ${emp.primerApellido}" no tiene asignado el servicio "${srv.nombre}".`
      );
    }
  }

  if (unassignedErrors.length > 0) {
    throw createHttpError(400, {
      error: 'Datos inválidos.',
      details: unassignedErrors,
    });
  }
}

function buildResolvedServicios(body, serviciosMap) {
  let cursorMs = Date.parse(body.fechaHoraInicio.trim());

  return body.servicios.map((item, index) => {
    const servicio = serviciosMap.get(item.servicioId);
    const duracionAplicada =
      item.duracionAplicada !== undefined && item.duracionAplicada !== null
        ? item.duracionAplicada
        : servicio.duracionEstimada;
    const precioAplicado =
      item.precioAplicado !== undefined && item.precioAplicado !== null
        ? item.precioAplicado
        : servicio.precio;

    const inicioDate =
      item.inicioPlanificado !== undefined && item.inicioPlanificado !== null
        ? new Date(item.inicioPlanificado.trim())
        : new Date(cursorMs);
    const finDate =
      item.finPlanificado !== undefined && item.finPlanificado !== null
        ? new Date(item.finPlanificado.trim())
        : new Date(inicioDate.getTime() + duracionAplicada * 60_000);

    if (finDate.getTime() <= inicioDate.getTime()) {
      throw createHttpError(400, {
        error: 'Datos inválidos.',
        details: [
          `servicios[${index}].finPlanificado debe ser mayor que inicioPlanificado.`,
        ],
      });
    }

    cursorMs = finDate.getTime();

    return {
      servicioId: item.servicioId,
      empleadoId: item.empleadoId,
      inicioPlanificado: inicioDate.toISOString(),
      finPlanificado: finDate.toISOString(),
      duracionAplicada,
      precioAplicado,
    };
  });
}

function checkSelfOverlaps(resolvedServicios, empleadosMap) {
  const itemsByEmpleado = new Map();

  for (const item of resolvedServicios) {
    const list = itemsByEmpleado.get(item.empleadoId) || [];
    list.push({
      startMs: Date.parse(item.inicioPlanificado),
      endMs: Date.parse(item.finPlanificado),
    });
    itemsByEmpleado.set(item.empleadoId, list);
  }

  for (const [empleadoId, ranges] of itemsByEmpleado.entries()) {
    if (ranges.length < 2) continue;

    ranges.sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < ranges.length; i += 1) {
      if (ranges[i].startMs < ranges[i - 1].endMs) {
        const emp = empleadosMap.get(empleadoId);
        throw createHttpError(409, {
          error: `Conflicto de horario: el empleado "${emp.primerNombre} ${emp.primerApellido}" tiene servicios solapados dentro de la misma cita.`,
        });
      }
    }
  }
}

async function checkDatabaseOverlaps(client, resolvedServicios, excludeCitaId) {
  for (const item of resolvedServicios) {
    const overlapResult = await client.query(
      `SELECT
         cs.cita_id AS "citaId",
         cs.inicio_planificado AS "inicioPlanificado",
         cs.fin_planificado AS "finPlanificado"
       FROM cita_servicio cs
       INNER JOIN cita c ON c.id = cs.cita_id
       WHERE cs.empleado_id = $1
         AND c.estado <> 'Cancelada'
         AND ($2::int IS NULL OR cs.cita_id <> $2)
         AND cs.inicio_planificado < $4::timestamptz
         AND cs.fin_planificado > $3::timestamptz
       LIMIT 1`,
      [
        item.empleadoId,
        excludeCitaId,
        item.inicioPlanificado,
        item.finPlanificado,
      ]
    );

    if (overlapResult.rowCount > 0) {
      const conflict = overlapResult.rows[0];
      throw createHttpError(409, {
        error: `Conflicto de horario: el empleado ${item.empleadoId} ya tiene un servicio agendado en la cita #${conflict.citaId} dentro de ese rango.`,
      });
    }
  }
}

async function insertCitaServicios(client, citaId, resolvedServicios) {
  const servicioIds = resolvedServicios.map((s) => s.servicioId);
  const empleadoIds = resolvedServicios.map((s) => s.empleadoId);
  const inicios = resolvedServicios.map((s) => s.inicioPlanificado);
  const fines = resolvedServicios.map((s) => s.finPlanificado);
  const duraciones = resolvedServicios.map((s) => s.duracionAplicada);
  const precios = resolvedServicios.map((s) => s.precioAplicado);

  await client.query(
    `INSERT INTO cita_servicio (
      cita_id,
      servicio_id,
      empleado_id,
      inicio_planificado,
      fin_planificado,
      duracion_aplicada,
      precio_aplicado
    )
    SELECT
      $1,
      t.servicio_id,
      t.empleado_id,
      t.inicio_planificado,
      t.fin_planificado,
      t.duracion_aplicada,
      t.precio_aplicado
    FROM UNNEST(
      $2::int[],
      $3::int[],
      $4::timestamptz[],
      $5::timestamptz[],
      $6::int[],
      $7::numeric(12, 2)[]
    ) AS t(
      servicio_id,
      empleado_id,
      inicio_planificado,
      fin_planificado,
      duracion_aplicada,
      precio_aplicado
    )`,
    [citaId, servicioIds, empleadoIds, inicios, fines, duraciones, precios]
  );
}

router.get('/', async (req, res) => {
  const filterErrors = validateCitaFilters(req.query);
  if (filterErrors.length > 0) {
    return res.status(400).json({
      error: 'Parámetros de consulta inválidos.',
      details: filterErrors,
    });
  }

  const conditions = [];
  const params = [];

  if (req.query.fecha !== undefined) {
    params.push(APP_TIMEZONE, req.query.fecha);
    const tzIdx = params.length - 1;
    const dateIdx = params.length;
    conditions.push(
      `(c.fecha_hora_inicio AT TIME ZONE $${tzIdx})::date = $${dateIdx}::date`
    );
  }

  if (req.query.estado !== undefined) {
    params.push(req.query.estado);
    conditions.push(`c.estado = $${params.length}`);
  }

  if (req.query.clienteId !== undefined) {
    params.push(Number(req.query.clienteId));
    conditions.push(`c.cliente_id = $${params.length}`);
  }

  if (req.query.empleadoId !== undefined) {
    params.push(Number(req.query.empleadoId));
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM cita_servicio cs_filter
        WHERE cs_filter.cita_id = c.id
          AND cs_filter.empleado_id = $${params.length}
      )`
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `${citaSelectQuery}
     ${whereClause}
     GROUP BY c.id, cl.id
     ORDER BY c.fecha_hora_inicio, c.id`,
    params
  );

  return res.status(200).json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const cita = await findCitaById(pool, id);
  if (!cita) {
    return res.status(404).json({ error: 'Cita no encontrada.' });
  }

  return res.status(200).json(cita);
});

router.post('/', async (req, res) => {
  const errors = validateCita(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const estado = req.body.estado || 'Programada';
  const observaciones = normalizeOptionalString(req.body.observaciones);
  const fechaHoraInicio = new Date(
    req.body.fechaHoraInicio.trim()
  ).toISOString();

  try {
    const createdCita = await withTransaction(async (client) => {
      const { serviciosMap, empleadosMap } = await validateAndLoadReferences(
        client,
        req.body,
        false
      );

      await validateEmpleadoServicioAssignments(
        client,
        req.body.servicios,
        empleadosMap,
        serviciosMap
      );

      const resolvedServicios = buildResolvedServicios(req.body, serviciosMap);

      if (estado !== 'Cancelada') {
        checkSelfOverlaps(resolvedServicios, empleadosMap);
        await checkDatabaseOverlaps(client, resolvedServicios, null);
      }

      const insertResult = await client.query(
        `INSERT INTO cita (
          cliente_id,
          fecha_hora_inicio,
          estado,
          observaciones
        )
        VALUES ($1, $2::timestamptz, $3, $4)
        RETURNING id`,
        [req.body.clienteId, fechaHoraInicio, estado, observaciones]
      );

      const citaId = insertResult.rows[0].id;
      await insertCitaServicios(client, citaId, resolvedServicios);

      return findCitaById(client, citaId);
    });

    return res.status(201).json(createdCita);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    throw error;
  }
});

router.put('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const errors = validateCita(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  const observaciones = normalizeOptionalString(req.body.observaciones);
  const fechaHoraInicio = new Date(
    req.body.fechaHoraInicio.trim()
  ).toISOString();

  try {
    const updatedCita = await withTransaction(async (client) => {
      const existingResult = await client.query(
        `SELECT id, estado FROM cita WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (existingResult.rowCount === 0) {
        throw createHttpError(404, { error: 'Cita no encontrada.' });
      }

      const estado = req.body.estado || existingResult.rows[0].estado;

      const { serviciosMap, empleadosMap } = await validateAndLoadReferences(
        client,
        req.body,
        true
      );

      await validateEmpleadoServicioAssignments(
        client,
        req.body.servicios,
        empleadosMap,
        serviciosMap
      );

      const resolvedServicios = buildResolvedServicios(req.body, serviciosMap);

      if (estado !== 'Cancelada') {
        checkSelfOverlaps(resolvedServicios, empleadosMap);
        await checkDatabaseOverlaps(client, resolvedServicios, id);
      }

      await client.query(
        `UPDATE cita
         SET cliente_id = $1,
             fecha_hora_inicio = $2::timestamptz,
             estado = $3,
             observaciones = $4
         WHERE id = $5`,
        [req.body.clienteId, fechaHoraInicio, estado, observaciones, id]
      );

      await client.query(`DELETE FROM cita_servicio WHERE cita_id = $1`, [id]);
      await insertCitaServicios(client, id, resolvedServicios);

      return findCitaById(client, id);
    });

    return res.status(200).json(updatedCita);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    throw error;
  }
});

router.patch('/:id/estado', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  const errors = validateCitaEstado(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', details: errors });
  }

  try {
    const updatedCita = await withTransaction(async (client) => {
      const existingResult = await client.query(
        `SELECT id, estado FROM cita WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (existingResult.rowCount === 0) {
        throw createHttpError(404, { error: 'Cita no encontrada.' });
      }

      const previousEstado = existingResult.rows[0].estado;
      const nextEstado = req.body.estado;

      if (previousEstado === 'Cancelada' && nextEstado !== 'Cancelada') {
        const itemsResult = await client.query(
          `SELECT
             empleado_id AS "empleadoId",
             inicio_planificado AS "inicioPlanificado",
             fin_planificado AS "finPlanificado"
           FROM cita_servicio
           WHERE cita_id = $1`,
          [id]
        );

        const empleadoIds = [
          ...new Set(itemsResult.rows.map((item) => item.empleadoId)),
        ].sort((a, b) => a - b);

        if (empleadoIds.length > 0) {
          await client.query(
            `SELECT id FROM usuario WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
            [empleadoIds]
          );
          await checkDatabaseOverlaps(client, itemsResult.rows, id);
        }
      }

      await client.query(`UPDATE cita SET estado = $1 WHERE id = $2`, [
        nextEstado,
        id,
      ]);

      return findCitaById(client, id);
    });

    return res.status(200).json(updatedCita);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    throw error;
  }
});

router.delete('/:id', async (req, res) => {
  const id = getId(req, res);
  if (id === null) return;

  try {
    const deletedCita = await withTransaction(async (client) => {
      const existingCita = await findCitaById(client, id);
      if (!existingCita) {
        throw createHttpError(404, { error: 'Cita no encontrada.' });
      }

      await client.query(`DELETE FROM cita WHERE id = $1`, [id]);
      return existingCita;
    });

    return res.status(200).json(deletedCita);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json(error.body);
    }
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar la cita porque tiene un pago asociado.',
      });
    }
    throw error;
  }
});

module.exports = router;
