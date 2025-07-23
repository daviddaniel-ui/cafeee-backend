-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS cafeee;
USE cafeee;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    contrasena VARCHAR(100) NOT NULL,
    rol ENUM('admin', 'cajero') NOT NULL,
    activo TINYINT(1) DEFAULT 1
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    categoria VARCHAR(50),
    imagen VARCHAR(255),
    activo TINYINT(1) DEFAULT 1
);

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Detalle de productos vendidos en cada venta
CREATE TABLE IF NOT EXISTS ventas_productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Insertar usuario administrador por defecto (contraseña: admin123, hash bcrypt)
INSERT INTO usuarios (usuario, contrasena, rol, activo)
VALUES (
    'admin',
    '$2b$10$JaZmsaVXfs1q6F4.hxaFkuMxssYLOuVdPS5R1sZ4GqYXnY.WxMdVS',
    'admin',
    1
)
ON DUPLICATE KEY UPDATE usuario=usuario; 