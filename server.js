const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'riata.db');
let db = null;

async function ensureDir() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function initDatabase() {
    await ensureDir();
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '', role TEXT DEFAULT 'customer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, icon TEXT DEFAULT '', image TEXT DEFAULT '', description TEXT DEFAULT '', active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', price REAL NOT NULL, original_price REAL, category_id INTEGER, image TEXT DEFAULT '', stock_status TEXT DEFAULT 'IN_STOCK', returnable INTEGER DEFAULT 1, quantity INTEGER DEFAULT 0, unit TEXT DEFAULT 'piece', brand TEXT DEFAULT '', featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT, customer_name TEXT, customer_email TEXT, total_amount REAL NOT NULL, delivery_address TEXT, payment_method TEXT DEFAULT 'COD', notes TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT, quantity INTEGER NOT NULL, price REAL NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS cart (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, quantity INTEGER DEFAULT 1, user_id TEXT, session_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    
    // Create admin
    const adminExists = db.exec("SELECT id FROM users WHERE email = 'admin@riatamarket.com'");
    if (adminExists.length === 0 || adminExists[0].values.length === 0) {
        const adminId = uuidv4();
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'admin')", [adminId, 'Administrator', 'admin@riatamarket.com', hashedPassword]);
    }
    
    // Seed categories
    const catCount = db.exec("SELECT COUNT(*) as count FROM categories");
    if (catCount[0].values[0][0] === 0) {
        const categories = [
            ['Chicken, Meat & Fish', 'chicken-meat-fish', '', ''],
            ['Pet Care', 'pet-care', '', ''],
            ['Baby Care', 'baby-care', '', ''],
            ['Sweet Tooth', 'sweet-tooth', '', ''],
            ['Tea, Coffee & Health Drinks', 'tea-coffee-health-drinks', '', ''],
            ['Beauty & Cosmetics', 'beauty-cosmetics', '', ''],
            ['Dairy, Bread & Eggs', 'dairy-bread-eggs', '', ''],
            ['Breakfast & Instant Food', 'breakfast-instant-food', '', ''],
            ['Flour, Rice & Pulses', 'flour-rice-pulses', '', ''],
            ['Cleaning Essentials', 'cleaning-essentials', '', ''],
            ['Personal Care', 'personal-care', '', ''],
            ['Cosmetics', 'cosmetics', '', ''],
            ['Organic & Gourmet', 'organic-gourmet', '', ''],
            ['Beverages', 'beverages', '', ''],
            ['Cold Drinks & Juices', 'cold-drinks-juices', '', ''],
            ['Bakery & Biscuits', 'bakery-biscuits', '', ''],
            ['Sauces & Spreads', 'sauces-spreads', '', ''],
            ['Vegetables & Fruits', 'vegetables-fruits', '', ''],
            ['Deals', 'deals', '', '']
        ];
        categories.forEach(([name, slug, icon, image]) => {
            db.run("INSERT INTO categories (name, slug, icon, image) VALUES (?, ?, ?, ?)", [name, slug, icon, image]);
        });
    }
    
    // Seed products
    const prodCount = db.exec("SELECT COUNT(*) FROM products");
    if (prodCount[0].values[0][0] === 0) {
        const sampleProducts = [
            ['Fresh Chicken', 180, 220, 1, ''],
            ['Fish Fillet', 250, 300, 1, ''],
            ['Mutton', 450, 500, 1, ''],
            ['Milk (1L)', 45, null, 7, ''],
            ['Bread', 35, 45, 7, ''],
            ['Eggs (Dozen)', 60, 75, 7, ''],
            ['Basmati Rice (1kg)', 80, 100, 9, ''],
            ['Atta (1kg)', 50, 65, 9, ''],
            ['Sugar (1kg)', 40, 50, 9, ''],
            ['Cooking Oil (1L)', 150, 180, 9, ''],
            ['Shampoo', 120, 150, 11, ''],
            ['Toothpaste', 50, 75, 11, ''],
            ['Soap', 30, 45, 11, ''],
            ['Chips', 20, 30, 16, ''],
            ['Cookies', 40, 50, 16, ''],
            ['Cola', 40, 50, 15, ''],
            ['Orange Juice', 80, 100, 15, ''],
            ['Water Bottle', 20, 25, 14, ''],
            ['Tomato Sauce', 90, 120, 17, ''],
            ['Detergent', 150, 200, 10, '']
        ];
        
        sampleProducts.forEach(([name, price, origPrice, catId, image]) => {
            const id = uuidv4();
            db.run("INSERT INTO products (id, name, price, original_price, category_id, image, active, stock_status) VALUES (?, ?, ?, ?, ?, ?, 1, 'IN_STOCK')", [id, name, price, origPrice || null, catId, image]);
        });
    }
    
    saveDatabase();
    console.log('✓ Database initialized');
}

function saveDatabase() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getResults(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

function getOne(sql, params = []) {
    const results = getResults(sql, params);
    return results.length > 0 ? results[0] : null;
}

// ============ API ROUTES ============

app.get('/api/products', (req, res) => {
    const products = getResults(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1`);
    res.json({ success: true, data: products });
});

app.get('/api/products/featured', (req, res) => {
    const products = getResults(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND p.featured = 1`);
    res.json({ success: true, data: products });
});

app.get('/api/products/deals', (req, res) => {
    const products = getResults(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND p.original_price > p.price`);
    res.json({ success: true, data: products });
});

app.get('/api/products/category/:id', (req, res) => {
    const products = getResults(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.category_id = ? AND p.active = 1`, [req.params.id]);
    res.json({ success: true, data: products });
});

app.get('/api/categories', (req, res) => {
    const categories = getResults("SELECT * FROM categories WHERE active = 1");
    res.json({ success: true, data: categories });
});

// ============ AUTH ============

app.post('/api/auth/register', (req, res) => {
    const { name, email, phone, address, password } = req.body;
    const existing = getOne("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) return res.json({ success: false, message: 'Email already exists' });
    
    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (id, name, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?, 'customer')", [id, name, email, hashedPassword, phone || '', address || '']);
    saveDatabase();
    res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.json({ success: false, message: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role } });
});

// ============ CART ============

app.get('/api/cart', (req, res) => {
    const { user_id, session_id } = req.query;
    let cart;
    if (user_id) cart = getResults(`SELECT cart.id as cart_id, cart.product_id, cart.quantity as cart_quantity, p.name, p.price, p.image, p.category_id, p.stock_status, p.unit, c.name as category_name FROM cart LEFT JOIN products p ON cart.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id WHERE cart.user_id = ?`, [user_id]);
    else if (session_id) cart = getResults(`SELECT cart.id as cart_id, cart.product_id, cart.quantity as cart_quantity, p.name, p.price, p.image, p.category_id, p.stock_status, p.unit, c.name as category_name FROM cart LEFT JOIN products p ON cart.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id WHERE cart.session_id = ?`, [session_id]);
    res.json({ success: true, data: cart || [] });
});

app.post('/api/cart/add', (req, res) => {
    const { product_id, quantity, user_id, session_id } = req.body;
    let existing;
    if (user_id) existing = getOne("SELECT * FROM cart WHERE product_id = ? AND user_id = ?", [product_id, user_id]);
    else if (session_id) existing = getOne("SELECT * FROM cart WHERE product_id = ? AND session_id = ?", [product_id, session_id]);
    
    if (existing) db.run("UPDATE cart SET quantity = quantity + ? WHERE id = ?", [quantity || 1, existing.id]);
    else db.run("INSERT INTO cart (id, product_id, quantity, user_id, session_id) VALUES (?, ?, ?, ?, ?)", [uuidv4(), product_id, quantity || 1, user_id || null, session_id || null]);
    saveDatabase();
    res.json({ success: true });
});

app.put('/api/cart/update/:id', (req, res) => {
    db.run("UPDATE cart SET quantity = ? WHERE id = ?", [req.body.quantity, req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

app.delete('/api/cart/remove/:id', (req, res) => {
    db.run("DELETE FROM cart WHERE id = ?", [req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

// ============ ORDERS ============

app.post('/api/orders', (req, res) => {
    const { user_id, session_id, delivery_address, payment_method, notes } = req.body;
    let user = user_id ? getOne("SELECT * FROM users WHERE id = ?", [user_id]) : null;
    let cartItems = user_id ? getResults(`SELECT cart.*, p.name, p.price FROM cart LEFT JOIN products p ON cart.product_id = p.id WHERE cart.user_id = ?`, [user_id]) : getResults(`SELECT cart.*, p.name, p.price FROM cart LEFT JOIN products p ON cart.product_id = p.id WHERE cart.session_id = ?`, [session_id]);
    
    if (!cartItems || cartItems.length === 0) return res.json({ success: false, message: 'Cart is empty' });
    
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderId = uuidv4();
    
    db.run(`INSERT INTO orders (id, user_id, customer_name, customer_email, total_amount, delivery_address, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [orderId, user_id || null, user?.name || 'Guest', user?.email || '', totalAmount, delivery_address, payment_method || 'COD', notes || '']);
    cartItems.forEach(item => db.run(`INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)`, [orderId, item.product_id, item.name, item.quantity, item.price]));
    
    if (user_id) db.run("DELETE FROM cart WHERE user_id = ?", [user_id]);
    else if (session_id) db.run("DELETE FROM cart WHERE session_id = ?", [session_id]);
    saveDatabase();
    res.json({ success: true, orderId });
});

// ============ ADMIN ============

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    const user = getOne("SELECT * FROM users WHERE email = ? AND role = 'admin'", [email]);
    if (!user) return res.json({ success: false, message: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/admin/stats', (req, res) => {
    const totalProducts = getOne("SELECT COUNT(*) as count FROM products WHERE active = 1")?.count || 0;
    const pendingOrders = getOne("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'")?.count || 0;
    const totalRevenue = getOne("SELECT SUM(total_amount) as total FROM orders")?.total || 0;
    const totalUsers = getOne("SELECT COUNT(*) as count FROM users WHERE role = 'customer'")?.count || 0;
    res.json({ success: true, data: { totalProducts, pendingOrders, totalRevenue, totalUsers } });
});

app.get('/api/admin/orders', (req, res) => {
    const orders = getResults("SELECT * FROM orders ORDER BY created_at DESC");
    res.json({ success: true, data: orders });
});

app.get('/api/admin/orders/:id', (req, res) => {
    const order = getOne("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    const items = getResults("SELECT * FROM order_items WHERE order_id = ?", [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
});

// FIXED: Update Order Status
app.put('/api/admin/orders/:id/status', (req, res) => {
    const { status } = req.body;
    console.log('Updating order:', req.params.id, 'to status:', status);
    db.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
    saveDatabase();
    res.json({ success: true, message: 'Status updated' });
});

app.get('/api/admin/categories', (req, res) => {
    const categories = getResults("SELECT * FROM categories ORDER BY id DESC");
    res.json({ success: true, data: categories });
});

// FIXED: Add Category with Image URL
app.post('/api/admin/categories', (req, res) => {
    const { name, icon, image, description, active } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    db.run("INSERT INTO categories (name, slug, icon, image, description, active) VALUES (?, ?, ?, ?, ?, ?)", [name, slug, icon || '', image || '', description || '', active ? 1 : 0]);
    saveDatabase();
    res.json({ success: true });
});

app.put('/api/admin/categories/:id', (req, res) => {
    const { name, icon, image, description, active } = req.body;
    db.run("UPDATE categories SET name = ?, icon = ?, image = ?, description = ?, active = ? WHERE id = ?", [name, icon || '', image || '', description || '', active ? 1 : 0, req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

app.delete('/api/admin/categories/:id', (req, res) => {
    db.run("DELETE FROM categories WHERE id = ?", [req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

app.get('/api/admin/products', (req, res) => {
    const products = getResults("SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.id DESC");
    res.json({ success: true, data: products });
});

// FIXED: Add Product with correct parameters
app.post('/api/admin/products', (req, res) => {
    const { name, description, price, original_price, category_id, image, stock_status, returnable, quantity, unit, brand, featured, active } = req.body;
    const id = uuidv4();
    db.run(`INSERT INTO products (id, name, description, price, original_price, category_id, image, stock_status, returnable, quantity, unit, brand, featured, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, description || '', price, original_price || null, category_id || null, image || '', stock_status || 'IN_STOCK', returnable ? 1 : 0, quantity || 0, unit || 'piece', brand || '', featured ? 1 : 0, active ? 1 : 0]);
    saveDatabase();
    res.json({ success: true });
});

app.put('/api/admin/products/:id', (req, res) => {
    const { name, description, price, original_price, category_id, image, stock_status, returnable, quantity, unit, brand, featured, active } = req.body;
    db.run(`UPDATE products SET name = ?, description = ?, price = ?, original_price = ?, category_id = ?, image = ?, stock_status = ?, returnable = ?, quantity = ?, unit = ?, brand = ?, featured = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [name, description || '', price, original_price || null, category_id || null, image || '', stock_status || 'IN_STOCK', returnable ? 1 : 0, quantity || 0, unit || 'piece', brand || '', featured ? 1 : 0, active ? 1 : 0, req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

app.delete('/api/admin/products/:id', (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", [req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

app.get('/api/admin/users', (req, res) => {
    const users = getResults("SELECT * FROM users ORDER BY created_at DESC");
    res.json({ success: true, data: users });
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE id = ? AND role != 'admin'", [req.params.id]);
    saveDatabase();
    res.json({ success: true });
});

app.get('/api/admin/database', (req, res) => {
    const data = {
        users: getOne("SELECT COUNT(*) as count FROM users")?.count || 0,
        categories: getOne("SELECT COUNT(*) as count FROM categories")?.count || 0,
        products: getOne("SELECT COUNT(*) as count FROM products")?.count || 0,
        orders: getOne("SELECT COUNT(*) as count FROM orders")?.count || 0,
        revenue: getOne("SELECT SUM(total_amount) as total FROM orders")?.total || 0
    };
    res.json({ success: true, data });
});

app.post('/api/admin/database/reset', (req, res) => {
    if (req.body.confirm !== 'RESET') return res.json({ success: false, message: 'Invalid confirmation' });
    db.run("DELETE FROM order_items");
    db.run("DELETE FROM orders");
    db.run("DELETE FROM cart");
    db.run("DELETE FROM products");
    db.run("DELETE FROM categories");
    const categories = [['Chicken, Meat & Fish', 'chicken-meat-fish', '', ''], ['Pet Care', 'pet-care', '', ''], ['Baby Care', 'baby-care', '', ''], ['Sweet Tooth', 'sweet-tooth', '', ''], ['Tea, Coffee & Health Drinks', 'tea-coffee-health-drinks', '', ''], ['Beauty & Cosmetics', 'beauty-cosmetics', '', ''], ['Dairy, Bread & Eggs', 'dairy-bread-eggs', '', ''], ['Breakfast & Instant Food', 'breakfast-instant-food', '', ''], ['Flour, Rice & Pulses', 'flour-rice-pulses', '', ''], ['Cleaning Essentials', 'cleaning-essentials', '', ''], ['Personal Care', 'personal-care', '', ''], ['Cosmetics', 'cosmetics', '', ''], ['Organic & Gourmet', 'organic-gourmet', '', ''], ['Beverages', 'beverages', '', ''], ['Cold Drinks & Juices', 'cold-drinks-juices', '', ''], ['Bakery & Biscuits', 'bakery-biscuits', '', ''], ['Sauces & Spreads', 'sauces-spreads', '', ''], ['Vegetables & Fruits', 'vegetables-fruits', '', ''], ['Deals', 'deals', '', '']];
    categories.forEach(([name, slug, icon, image]) => db.run("INSERT INTO categories (name, slug, icon, image) VALUES (?, ?, ?, ?)", [name, slug, icon, image]));
    saveDatabase();
    res.json({ success: true, message: 'Database reset' });
});

// Serve HTML
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', async () => {
    await initDatabase();
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Admin: http://localhost:${PORT}/admin`);
});
