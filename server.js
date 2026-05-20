
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database Setup
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'riata.db');
let db = null;

async function ensureDir() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
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
    
    // Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT DEFAULT '',
            address TEXT DEFAULT '',
            role TEXT DEFAULT 'customer',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Categories Table
    db.run(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            icon TEXT DEFAULT '',
            description TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Products Table
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            price REAL NOT NULL,
            original_price REAL,
            category_id INTEGER,
            image TEXT DEFAULT '',
            stock_status TEXT DEFAULT 'IN_STOCK',
            returnable INTEGER DEFAULT 1,
            quantity INTEGER DEFAULT 0,
            unit TEXT DEFAULT 'piece',
            brand TEXT DEFAULT '',
            featured INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    `);
    
    // Orders Table
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            customer_name TEXT,
            customer_email TEXT,
            total_amount REAL NOT NULL,
            delivery_address TEXT,
            payment_method TEXT DEFAULT 'COD',
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    
    // Order Items Table
    db.run(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `);
    
    // Cart Table
    db.run(`
        CREATE TABLE IF NOT EXISTS cart (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            user_id TEXT,
            session_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `);
    
    // Create Admin User
    const adminExists = db.exec("SELECT id FROM users WHERE email = 'admin@riatamarket.com'");
    if (adminExists.length === 0 || adminExists[0].values.length === 0) {
        const adminId = uuidv4();
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            [adminId, 'Administrator', 'admin@riatamarket.com', hashedPassword, 'admin']);
    }
    
    // Seed Categories
    const catCount = db.exec("SELECT COUNT(*) as count FROM categories");
    if (catCount[0].values[0][0] === 0) {
        const categories = [
            ['Chicken, Meat & Fish', 'chicken-meat-fish', '🍖'],
            ['Pet Care', 'pet-care', '🐾'],
            ['Baby Care', 'baby-care', '👶'],
            ['Sweet Tooth', 'sweet-tooth', '🍫'],
            ['Tea, Coffee & Health Drinks', 'tea-coffee-health-drinks', '☕'],
            ['Beauty & Cosmetics', 'beauty-cosmetics', '💄'],
            ['Dairy, Bread & Eggs', 'dairy-bread-eggs', '🥛'],
            ['Breakfast & Instant Food', 'breakfast-instant-food', '🥣'],
            ['Flour, Rice & Pulses', 'flour-rice-pulses', '🌾'],
            ['Cleaning Essentials', 'cleaning-essentials', '🧹'],
            ['Personal Care', 'personal-care', '🧴'],
            ['Cosmetics', 'cosmetics', '💅'],
            ['Organic & Gourmet', 'organic-gourmet', '🥗'],
            ['Beverages', 'beverages', '🥤'],
            ['Cold Drinks & Juices', 'cold-drinks-juices', '🧃'],
            ['Bakery & Biscuits', 'bakery-biscuits', '🍪'],
            ['Sauces & Spreads', 'sauces-spreads', '🫙'],
            ['Vegetables & Fruits', 'vegetables-fruits', '🥬'],
            ['Deals', 'deals', '🏷️']
        ];
        
        categories.forEach(([name, slug, icon]) => {
            db.run("INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)", [name, slug, icon]);
        });
    }
    
    saveDatabase();
    console.log('✓ Database initialized');
}

function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
    if (!db) throw new Error('Database not initialized');
    
    return {
        prepare: (sql) => ({
            run: (...params) => {
                db.run(sql, params);
                saveDatabase();
                return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] };
            },
            get: (...params) => {
                const result = db.exec(sql, params);
                if (result.length === 0 || result[0].values.length === 0) return undefined;
                const columns = result[0].columns;
                const values = result[0].values[0];
                const row = {};
                columns.forEach((col, i) => row[col] = values[i]);
                return row;
            },
            all: (...params) => {
                const result = db.exec(sql, params);
                if (result.length === 0) return [];
                const columns = result[0].columns;
                return result[0].values.map(values => {
                    const row = {};
                    columns.forEach((col, i) => row[col] = values[i]);
                    return row;
                });
            }
        })
    };
}

// ============ API ROUTES ============

// Get Products
app.get('/api/products', (req, res) => {
    const products = db.prepare(`
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        WHERE products.active = 1
    `).all();
    res.json({ success: true, data: products });
});

// Get Featured Products
app.get('/api/products/featured', (req, res) => {
    const products = db.prepare(`
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        WHERE products.active = 1 AND products.featured = 1
    `).all();
    res.json({ success: true, data: products });
});

// Get Products with Deals
app.get('/api/products/deals', (req, res) => {
    const products = db.prepare(`
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        WHERE products.active = 1 AND products.original_price > products.price
    `).all();
    res.json({ success: true, data: products });
});

// Get Products by Category
app.get('/api/products/category/:id', (req, res) => {
    const products = db.prepare(`
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        WHERE products.category_id = ? AND products.active = 1
    `).all(req.params.id);
    res.json({ success: true, data: products });
});

// Get Single Product
app.get('/api/products/:id', (req, res) => {
    const product = db.prepare(`
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        WHERE products.id = ?
    `).get(req.params.id);
    res.json({ success: true, data: product });
});

// Get Categories
app.get('/api/categories', (req, res) => {
    const categories = db.prepare("SELECT * FROM categories WHERE active = 1").all();
    res.json({ success: true, data: categories });
});

// ============ AUTH APIs ============

// Register
app.post('/api/auth/register', (req, res) => {
    const { name, email, phone, address, password } = req.body;
    
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
        return res.json({ success: false, message: 'Email already exists' });
    }
    
    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.prepare("INSERT INTO users (id, name, email, password, phone, address) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, name, email, hashedPassword, phone || '', address || ''
    );
    
    res.json({ success: true });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }
    
    res.json({ 
        success: true, 
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role } 
    });
});

// ============ CART APIs ============

// Get Cart
app.get('/api/cart', (req, res) => {
    const { user_id, session_id } = req.query;
    let cart;
    
    if (user_id) {
        cart = db.prepare(`
            SELECT cart.id as cart_id, cart.product_id, cart.quantity as cart_quantity, 
            products.name, products.price, products.image, products.category_id, 
            products.category_name, products.stock_status, products.unit,
            products.quantity as product_stock
            FROM cart 
            LEFT JOIN products ON cart.product_id = products.id 
            WHERE cart.user_id = ?
        `).all(user_id);
    } else if (session_id) {
        cart = db.prepare(`
            SELECT cart.id as cart_id, cart.product_id, cart.quantity as cart_quantity, 
            products.name, products.price, products.image, products.category_id, 
            products.category_name, products.stock_status, products.unit,
            products.quantity as product_stock
            FROM cart 
            LEFT JOIN products ON cart.product_id = products.id 
            WHERE cart.session_id = ?
        `).all(session_id);
    }
    
    res.json({ success: true, data: cart || [] });
});

// Add to Cart
app.post('/api/cart/add', (req, res) => {
    const { product_id, quantity, user_id, session_id } = req.body;
    
    let existing;
    if (user_id) {
        existing = db.prepare("SELECT * FROM cart WHERE product_id = ? AND user_id = ?").get(product_id, user_id);
    } else if (session_id) {
        existing = db.prepare("SELECT * FROM cart WHERE product_id = ? AND session_id = ?").get(product_id, session_id);
    }
    
    if (existing) {
        db.prepare("UPDATE cart SET quantity = quantity + ? WHERE id = ?").run(quantity || 1, existing.id);
    } else {
        const cartId = uuidv4();
        db.prepare("INSERT INTO cart (id, product_id, quantity, user_id, session_id) VALUES (?, ?, ?, ?, ?)").run(
            cartId, product_id, quantity || 1, user_id || null, session_id || null
        );
    }
    
    res.json({ success: true });
});

// Update Cart Quantity
app.put('/api/cart/update/:id', (req, res) => {
    const { quantity } = req.body;
    db.prepare("UPDATE cart SET quantity = ? WHERE id = ?").run(quantity, req.params.id);
    res.json({ success: true });
});

// Remove from Cart
app.delete('/api/cart/remove/:id', (req, res) => {
    db.prepare("DELETE FROM cart WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

// ============ ORDER APIs ============

// Place Order
app.post('/api/orders', (req, res) => {
    const { user_id, session_id, delivery_address, payment_method, notes } = req.body;
    
    let user = null;
    if (user_id) {
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id);
    }
    
    // Get cart items
    let cartItems;
    if (user_id) {
        cartItems = db.prepare(`
            SELECT cart.*, products.name, products.price 
            FROM cart 
            LEFT JOIN products ON cart.product_id = products.id 
            WHERE cart.user_id = ?
        `).all(user_id);
    } else if (session_id) {
        cartItems = db.prepare(`
            SELECT cart.*, products.name, products.price 
            FROM cart 
            LEFT JOIN products ON cart.product_id = products.id 
            WHERE cart.session_id = ?
        `).all(session_id);
    }
    
    if (!cartItems || cartItems.length === 0) {
        return res.json({ success: false, message: 'Cart is empty' });
    }
    
    // Calculate total
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Create order
    const orderId = uuidv4();
    db.prepare(`
        INSERT INTO orders (id, user_id, customer_name, customer_email, total_amount, delivery_address, payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        orderId, 
        user_id || null, 
        user?.name || 'Guest',
        user?.email || '',
        totalAmount,
        delivery_address,
        payment_method || 'COD',
        notes || ''
    );
    
    // Add order items
    cartItems.forEach(item => {
        db.prepare(`
            INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
            VALUES (?, ?, ?, ?, ?)
        `).run(orderId, item.product_id, item.name, item.quantity, item.price);
    });
    
    // Clear cart
    if (user_id) {
        db.prepare("DELETE FROM cart WHERE user_id = ?").run(user_id);
    } else if (session_id) {
        db.prepare("DELETE FROM cart WHERE session_id = ?").run(session_id);
    }
    
    res.json({ success: true, orderId });
});

// Get Orders
app.get('/api/orders', (req, res) => {
    const { user_id, session_id } = req.query;
    let orders;
    
    if (user_id) {
        orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(user_id);
    } else if (session_id) {
        orders = db.prepare("SELECT * FROM orders WHERE session_id = ? ORDER BY created_at DESC").all(session_id);
    }
    
    res.json({ success: true, data: orders || [] });
});

// ============ ADMIN APIs ============

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'admin'").get(email);
    if (!user) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }
    
    res.json({ 
        success: true, 
        user: { id: user.id, name: user.name, email: user.email, role: user.role } 
    });
});

// Admin Stats
app.get('/api/admin/stats', (req, res) => {
    const totalProducts = db.exec("SELECT COUNT(*) as count FROM products WHERE active = 1")[0]?.values[0][0] || 0;
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get();
    const totalRevenue = db.exec("SELECT SUM(total_amount) as total FROM orders")[0]?.values[0][0] || 0;
    const totalUsers = db.exec("SELECT COUNT(*) as count FROM users WHERE role = 'customer'")[0]?.values[0][0] || 0;
    
    res.json({ 
        success: true, 
        data: { 
            totalProducts, 
            pendingOrders: pendingOrders?.count || 0, 
            totalRevenue, 
            totalUsers 
        } 
    });
});

// Admin Orders
app.get('/api/admin/orders', (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    res.json({ success: true, data: orders });
});

// Get Order Details
app.get('/api/admin/orders/:id', (req, res) => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
    res.json({ success: true, data: { ...order, items } });
});

// Update Order Status
app.put('/api/admin/orders/:id/status', (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
});

// Admin Categories
app.get('/api/admin/categories', (req, res) => {
    const categories = db.prepare("SELECT * FROM categories ORDER BY id DESC").all();
    res.json({ success: true, data: categories });
});

app.post('/api/admin/categories', (req, res) => {
    const { name, icon, description, active } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    db.prepare("INSERT INTO categories (name, slug, icon, description, active) VALUES (?, ?, ?, ?, ?)").run(
        name, slug, icon || '', description || '', active ? 1 : 0
    );
    
    res.json({ success: true });
});

app.put('/api/admin/categories/:id', (req, res) => {
    const { name, icon, description, active } = req.body;
    db.prepare("UPDATE categories SET name = ?, icon = ?, description = ?, active = ? WHERE id = ?").run(
        name, icon || '', description || '', active ? 1 : 0, req.params.id
    );
    res.json({ success: true });
});

app.delete('/api/admin/categories/:id', (req, res) => {
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

// Admin Products
app.get('/api/admin/products', (req, res) => {
    const products = db.prepare(`
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        ORDER BY products.id DESC
    `).all();
    res.json({ success: true, data: products });
});

app.post('/api/admin/products', (req, res) => {
    const { name, description, price, original_price, category_id, image, stock_status, returnable, quantity, unit, brand, featured, active } = req.body;
    const id = uuidv4();
    
    db.prepare(`
        INSERT INTO products (id, name, description, price, original_price, category_id, image, stock_status, returnable, quantity, unit, brand, featured, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || '', price, original_price || null, category_id || null, image || '', stock_status || 'IN_STOCK', returnable ? 1 : 0, quantity || 0, unit || 'piece', brand || '', featured ? 1 : 0, active ? 1 : 0);
    
    res.json({ success: true });
});

app.put('/api/admin/products/:id', (req, res) => {
    const { name, description, price, original_price, category_id, image, stock_status, returnable, quantity, unit, brand, featured, active } = req.body;
    
    db.prepare(`
        UPDATE products SET name = ?, description = ?, price = ?, original_price = ?, category_id = ?, image = ?, stock_status = ?, returnable = ?, quantity = ?, unit = ?, brand = ?, featured = ?, active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(name, description || '', price, original_price || null, category_id || null, image || '', stock_status || 'IN_STOCK', returnable ? 1 : 0, quantity || 0, unit || 'piece', brand || '', featured ? 1 : 0, active ? 1 : 0, req.params.id);
    
    res.json({ success: true });
});

app.delete('/api/admin/products/:id', (req, res) => {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

// Admin Users
app.get('/api/admin/users', (req, res) => {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
    res.json({ success: true, data: users });
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(req.params.id);
    res.json({ success: true });
});

// Database Info
app.get('/api/admin/database', (req, res) => {
    const data = {
        users: db.exec("SELECT COUNT(*) as count FROM users")[0]?.values[0][0] || 0,
        categories: db.exec("SELECT COUNT(*) as count FROM categories")[0]?.values[0][0] || 0,
        products: db.exec("SELECT COUNT(*) as count FROM products")[0]?.values[0][0] || 0,
        orders: db.exec("SELECT COUNT(*) as count FROM orders")[0]?.values[0][0] || 0
    };
    res.json({ success: true, data });
});

// Seed Data
app.post('/api/admin/database/seed', (req, res) => {
    const products = [
        ['Fresh Chicken', 1, 180, 220, 'chicken-meat-fish'],
        ['Fish Fillet', 1, 250, 300, 'chicken-meat-fish'],
        ['Mutton', 1, 450, 500, 'chicken-meat-fish'],
        ['Milk', 1, 45, null, 'dairy-bread-eggs'],
        ['Bread', 1, 35, 45, 'dairy-bread-eggs'],
        ['Eggs (Dozen)', 1, 60, 75, 'dairy-bread-eggs'],
        ['Rice (1kg)', 1, 80, 100, 'flour-rice-pulses'],
        ['Atta (1kg)', 1, 50, 65, 'flour-rice-pulses'],
        ['Sugar (1kg)', 1, 40, 50, 'flour-rice-pulses'],
        ['Cooking Oil', 1, 150, 180, 'flour-rice-pulses'],
        ['Shampoo', 1, 120, 150, 'personal-care'],
        ['Toothpaste', 1, 50, 75, 'personal-care'],
        ['Batteries', 1, 30, null, 'personal-care'],
        ['Chips', 1, 20, 30, 'bakery-biscuits'],
        ['Cookies', 1, 40, 50, 'bakery-biscuits'],
        ['Cola', 1, 40, 50, 'cold-drinks-juices'],
        ['Orange Juice', 1, 80, 100, 'cold-drinks-juices'],
        ['Water Bottle', 1, 20, 25, 'beverages'],
        ['Potato Chips', 1, 30, 45, 'bakery-biscuits'],
        ['Tomato Sauce', 1, 90, 120, 'sauces-spreads']
    ];
    
    const catMap = {};
    const categories = db.prepare("SELECT id, slug FROM categories").all();
    categories.forEach(c => catMap[c.slug] = c.id);
    
    products.forEach(([name, catIdx, price, origPrice, catSlug]) => {
        const id = uuidv4();
        db.prepare(`
            INSERT INTO products (id, name, price, original_price, category_id, active, stock_status)
            VALUES (?, ?, ?, ?, ?, 1, 'IN_STOCK')
        `).run(id, name, price, origPrice || null, catMap[catSlug] || null);
    });
    
    res.json({ success: true, message: 'Sample products added' });
});

// Reset Database
app.post('/api/admin/database/reset', (req, res) => {
    const { confirm } = req.body;
    if (confirm !== 'RESET') {
        return res.json({ success: false, message: 'Invalid confirmation' });
    }
    
    db.run("DELETE FROM order_items");
    db.run("DELETE FROM orders");
    db.run("DELETE FROM cart");
    db.run("DELETE FROM products");
    db.run("DELETE FROM categories");
    
    // Re-seed categories
    const categories = [
        ['Chicken, Meat & Fish', 'chicken-meat-fish', '🍖'],
        ['Pet Care', 'pet-care', '🐾'],
        ['Baby Care', 'baby-care', '👶'],
        ['Sweet Tooth', 'sweet-tooth', '🍫'],
        ['Tea, Coffee & Health Drinks', 'tea-coffee-health-drinks', '☕'],
        ['Beauty & Cosmetics', 'beauty-cosmetics', '💄'],
        ['Dairy, Bread & Eggs', 'dairy-bread-eggs', '🥛'],
        ['Breakfast & Instant Food', 'breakfast-instant-food', '🥣'],
        ['Flour, Rice & Pulses', 'flour-rice-pulses', '🌾'],
        ['Cleaning Essentials', 'cleaning-essentials', '🧹'],
        ['Personal Care', 'personal-care', '🧴'],
        ['Cosmetics', 'cosmetics', '💅'],
        ['Organic & Gourmet', 'organic-gourmet', '🥗'],
        ['Beverages', 'beverages', '🥤'],
        ['Cold Drinks & Juices', 'cold-drinks-juices', '🧃'],
        ['Bakery & Biscuits', 'bakery-biscuits', '🍪'],
        ['Sauces & Spreads', 'sauces-spreads', '🫙'],
        ['Vegetables & Fruits', 'vegetables-fruits', '🥬'],
        ['Deals', 'deals', '🏷️']
    ];
    
    categories.forEach(([name, slug, icon]) => {
        db.run("INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)", [name, slug, icon]);
    });
    
    res.json({ success: true, message: 'Database reset successfully' });
});

// Serve HTML
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
    await initDatabase();
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Admin panel: http://localhost:${PORT}/admin`);
});
