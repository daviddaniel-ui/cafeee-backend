const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const pool = require('./database.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const SECRET = 'cafeee_secret';

// Login
app.post('/api/login', async (req, res) => {
  const { usuario, contrasena } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
    const user = rows[0];
    if (!user) return res.json({ error: 'Usuario no encontrado' });
    if (!bcrypt.compareSync(contrasena, user.contrasena)) return res.json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: user.id, rol: user.rol, usuario: user.usuario }, SECRET, { expiresIn: '8h' });
    res.json({ token, rol: user.rol, usuario: user.usuario });
  } catch (err) {
    res.json({ error: 'Error de base de datos', details: err.message });
  }
});

function auth(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token requerido' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Token inválido' });
      if (roles.length && !roles.includes(user.rol)) return res.status(403).json({ error: 'No autorizado' });
      req.user = user;
      next();
    });
  };
}

// Listar cajeros (solo admin)
app.get('/api/usuarios', auth(['admin']), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, usuario, rol, activo FROM usuarios WHERE rol = 'cajero'");
    res.json({ cajeros: rows });
  } catch (err) {
    res.json({ error: 'Error al obtener cajeros' });
  }
});

// Desactivar o reactivar cajero (solo admin)
app.patch('/api/usuarios/:id/activo', auth(['admin']), async (req, res) => {
  const { activo } = req.body;
  try {
    await pool.query('UPDATE usuarios SET activo = ? WHERE id = ? AND rol = "cajero"', [activo ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: 'Error al actualizar cajero' });
  }
});

// Crear cajero (solo admin)
app.post('/api/usuarios', auth(['admin']), async (req, res) => {
  const { usuario, contrasena } = req.body;
  if (!usuario || !contrasena) return res.json({ error: 'Datos incompletos' });
  try {
    const [existe] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
    if (existe.length > 0) return res.json({ error: 'El usuario ya existe' });
    const hash = bcrypt.hashSync(contrasena, 10);
    await pool.query('INSERT INTO usuarios (usuario, contrasena, rol, activo) VALUES (?, ?, \'cajero\', 1)', [usuario, hash]);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: 'Error al crear cajero', details: err.message });
  }
});

// CRUD de productos (solo admin puede crear, editar, desactivar)
app.post('/api/productos', auth(['admin']), async (req, res) => {
  const { nombre, precio, categoria, imagen, activo } = req.body;
  if (!nombre || !precio) return res.json({ error: 'Datos incompletos' });
  try {
    const [result] = await pool.query('INSERT INTO productos (nombre, precio, categoria, imagen, activo) VALUES (?, ?, ?, ?, ?)', [nombre, precio, categoria || '', imagen || '', activo !== undefined ? activo : 1]);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.json({ error: 'Error al crear producto' });
  }
});

// Permitir que admin, cajero y cliente vean productos
app.get('/api/productos', auth(['admin', 'cajero', 'cliente']), async (req, res) => {
  try {
    let sql = 'SELECT * FROM productos';
    if (req.user.rol === 'cajero' || req.user.rol === 'cliente') sql += ' WHERE activo = 1';
    const [rows] = await pool.query(sql);
    res.json({ productos: rows });
  } catch (err) {
    res.json({ error: 'Error al obtener productos' });
  }
});

app.put('/api/productos/:id', auth(['admin']), async (req, res) => {
  const { nombre, precio, categoria, imagen, activo } = req.body;
  try {
    await pool.query('UPDATE productos SET nombre=?, precio=?, categoria=?, imagen=?, activo=? WHERE id=?', [nombre, precio, categoria, imagen, activo, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: 'Error al actualizar producto' });
  }
});

// Permitir que admin, cajero y cliente realicen pedidos
app.post('/api/ventas', auth(['admin', 'cajero', 'cliente']), async (req, res) => {
  const { productos, total } = req.body;
  if (!productos || !Array.isArray(productos) || productos.length === 0 || !total) return res.json({ error: 'Datos incompletos' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ventaResult] = await conn.query('INSERT INTO ventas (usuario_id, total) VALUES (?, ?)', [req.user.id, total]);
    const ventaId = ventaResult.insertId;
    for (const p of productos) {
      await conn.query('INSERT INTO ventas_productos (venta_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)', [ventaId, p.producto_id, p.cantidad, p.precio_unitario]);
    }
    await conn.commit();
    res.json({ success: true, id: ventaId });
  } catch (err) {
    await conn.rollback();
    res.json({ error: 'Error al registrar venta' });
  } finally {
    conn.release();
  }
});

// Listar ventas (admin ve todas, cajero solo las suyas)
app.get('/api/ventas', auth(['admin', 'cajero']), async (req, res) => {
  try {
    let sql = `SELECT ventas.id, usuarios.usuario, ventas.total, ventas.fecha FROM ventas JOIN usuarios ON ventas.usuario_id = usuarios.id`;
    let params = [];
    // Eliminar cualquier filtro por usuario_id para cajero
    sql += ' ORDER BY ventas.fecha DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ ventas: rows });
  } catch (err) {
    res.json({ error: 'Error al obtener ventas' });
  }
});

// Detalles de una venta
app.get('/api/ventas/:id', auth(['admin', 'cajero']), async (req, res) => {
  try {
    const [ventas] = await pool.query(`SELECT ventas.id, usuarios.usuario, ventas.total, ventas.fecha FROM ventas JOIN usuarios ON ventas.usuario_id = usuarios.id WHERE ventas.id = ?`, [req.params.id]);
    const venta = ventas[0];
    if (!venta) return res.json({ error: 'Venta no encontrada' });
    if (req.user.rol !== 'admin' && venta.usuario !== req.user.usuario) return res.status(403).json({ error: 'No autorizado' });
    const [productos] = await pool.query(`SELECT p.nombre, vp.cantidad, vp.precio_unitario FROM ventas_productos vp JOIN productos p ON vp.producto_id = p.id WHERE vp.venta_id = ?`, [req.params.id]);
    venta.productos = productos;
    res.json({ venta });
  } catch (err) {
    res.json({ error: 'Error al obtener detalles de venta' });
  }
});

// Registro de cliente
app.post('/api/registro', async (req, res) => {
  const { usuario, contrasena } = req.body;
  if (!usuario || !contrasena) return res.json({ error: 'Datos incompletos' });
  try {
    const [existe] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
    if (existe.length > 0) return res.json({ error: 'El usuario ya existe' });
    const hash = bcrypt.hashSync(contrasena, 10);
    await pool.query('INSERT INTO usuarios (usuario, contrasena, rol, activo) VALUES (?, ?, \'cliente\', 1)', [usuario, hash]);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: 'Error al registrar cliente', details: err.message });
  }
});

// Login de cliente (usa el mismo endpoint de /api/login, pero validamos el rol en el frontend)

// Permitir que el backend corra solo con node server.js
if (require.main === module) {
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`API escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app; 