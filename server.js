const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase, getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDatabase();

// ============================================
// CUSTOMER API - CATEGORIES
// ============================================

/**
 * GET /api/categories
 * Get all active categories
 */
app.get('/api/categories', (req, res) => {
    try {
        const db = getDb();
        const sql = 'SELECT * FROM categories WHERE active = 1 ORDER BY name';
        const categories = db.prepare(sql).all();
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CUSTOMER API - PRODUCTS
// ============================================

/**
 * GET /api/products
 * Get all active products
 */
app.get('/api/products', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.active = 1
        `;
        const products = db.prepare(sql).all();
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/products/category/:id
 * Get products by category
 */
app.get('/api/products/category/:id', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.category_id = ? AND p.active = 1
        `;
        const products = db.prepare(sql).all(req.params.id);
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/products/featured
 * Get featured products
 */
app.get('/api/products/featured', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.featured = 1 AND p.active = 1
        `;
        const products = db.prepare(sql).all();
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/products/deals
 * Get deal products (with discount)
 */
app.get('/api/products/deals', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.original_price > p.price AND p.active = 1
        `;
        const products = db.prepare(sql).all();
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/products/:id
 * Get single product by ID
 */
app.get('/api/products/:id', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.id = ?
        `;
        const product = db.prepare(sql).get(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/search
 * Search products by name
 */
app.get('/api/search', (req, res) => {
    try {
        const db = getDb();
        const searchTerm = req.query.q || '';
        
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.name LIKE ? AND p.active = 1
            LIMIT 20
        `;
        
        const products = db.prepare(sql).all('%' + searchTerm + '%');
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// AUTH - REGISTRATION
// ============================================

/**
 * POST /api/auth/register
 * Register new user
 */
app.post('/api/auth/register', (req, res) => {
    try {
        const db = getDb();
        const bcrypt = require('bcryptjs');
        const { v4: uuidv4 } = require('uuid');
        
        const { name, email, password, phone, address } = req.body;
        
        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, email and password are required' 
            });
        }
        
        // Check if email exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        // Create user
        const userId = uuidv4();
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        const sql = `
            INSERT INTO users (id, name, email, password, phone, address, role)
            VALUES (?, ?, ?, ?, ?, ?, 'customer')
        `;
        
        db.prepare(sql).run(
            userId, 
            name, 
            email, 
            hashedPassword, 
            phone || '', 
            address || ''
        );
        
        res.json({ 
            success: true, 
            message: 'Registration successful',
            userId: userId
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// AUTH - LOGIN
// ============================================

/**
 * POST /api/auth/login
 * Login user
 */
app.post('/api/auth/login', (req, res) => {
    try {
        const db = getDb();
        const bcrypt = require('bcryptjs');
        
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        // Find user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        
        // Check credentials
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Remove password from response
        const { password: _, ...userInfo } = user;
        
        res.json({ 
            success: true, 
            message: 'Login successful',
            user: userInfo
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CART - ADD ITEM
// ============================================

/**
 * POST /api/cart/add
 * Add item to cart
 */
app.post('/api/cart/add', (req, res) => {
    try {
        const db = getDb();
        const { user_id, session_id, product_id, quantity = 1 } = req.body;
        
        // Determine if using user_id or session_id
        const param = user_id || session_id;
        const type = user_id ? 'user_id' : 'session_id';
        
        // Check if item already in cart
        const checkSql = 'SELECT * FROM cart WHERE ' + type + ' = ? AND product_id = ?';
        const existingItem = db.prepare(checkSql).get(param, product_id);
        
        if (existingItem) {
            // Update quantity
            const updateSql = 'UPDATE cart SET quantity = quantity + ? WHERE id = ?';
            db.prepare(updateSql).run(quantity, existingItem.id);
        } else {
            // Insert new item
            const insertSql = 'INSERT INTO cart (user_id, session_id, product_id, quantity) VALUES (?, ?, ?, ?)';
            db.prepare(insertSql).run(user_id || null, session_id || null, product_id, quantity);
        }
        
        res.json({ success: true, message: 'Added to cart' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CART - GET ITEMS
// ============================================

/**
 * GET /api/cart
 * Get cart items
 */
app.get('/api/cart', (req, res) => {
    try {
        const db = getDb();
        const { user_id, session_id } = req.query;
        
        if (!user_id && !session_id) {
            return res.json({ success: true, data: [], total: 0 });
        }
        
        const type = user_id ? 'user_id' : 'session_id';
        const param = user_id || session_id;
        
        const sql = `
            SELECT c.id as cart_id, c.quantity, p.*
            FROM cart c 
            JOIN products p ON c.product_id = p.id
            WHERE c.${type} = ?
        `;
        
        const items = db.prepare(sql).all(param);
        const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        res.json({ success: true, data: items, total });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CART - UPDATE QUANTITY
// ============================================

/**
 * PUT /api/cart/update/:id
 * Update cart item quantity
 */
app.put('/api/cart/update/:id', (req, res) => {
    try {
        const db = getDb();
        const { quantity } = req.body;
        const { id } = req.params;
        
        if (quantity <= 0) {
            // Remove item
            db.prepare('DELETE FROM cart WHERE id = ?').run(id);
        } else {
            // Update quantity
            db.prepare('UPDATE cart SET quantity = ? WHERE id = ?').run(quantity, id);
        }
        
        res.json({ success: true, message: 'Cart updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CART - REMOVE ITEM
// ============================================

/**
 * DELETE /api/cart/remove/:id
 * Remove item from cart
 */
app.delete('/api/cart/remove/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM cart WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CART - CLEAR
// ============================================

/**
 * DELETE /api/cart/clear
 * Clear entire cart
 */
app.delete('/api/cart/clear', (req, res) => {
    try {
        const db = getDb();
        const { user_id, session_id } = req.query;
        
        if (user_id) {
            db.prepare('DELETE FROM cart WHERE user_id = ?').run(user_id);
        } else if (session_id) {
            db.prepare('DELETE FROM cart WHERE session_id = ?').run(session_id);
        }
        
        res.json({ success: true, message: 'Cart cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ORDERS - CREATE
// ============================================

/**
 * POST /api/orders
 * Create new order
 */
app.post('/api/orders', (req, res) => {
    try {
        const db = getDb();
        const { v4: uuidv4 } = require('uuid');
        
        const { user_id, delivery_address, payment_method, notes, session_id } = req.body;
        
        // Determine user/session
        const param = user_id || session_id;
        const type = user_id ? 'user_id' : 'session_id';
        
        // Get cart items
        const cartSql = 'SELECT c.*, p.price FROM cart c JOIN products p ON c.product_id = p.id WHERE c.' + type + ' = ?';
        const cartItems = db.prepare(cartSql).all(param);
        
        if (cartItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }
        
        // Calculate total
        const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Generate order ID
        const orderId = uuidv4();
        
        // Insert order
        const orderSql = `
            INSERT INTO orders (id, user_id, total_amount, delivery_address, payment_method, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `;
        db.prepare(orderSql).run(
            orderId,
            user_id || null,
            totalAmount,
            delivery_address,
            payment_method || 'COD',
            notes || ''
        );
        
        // Insert order items
        const itemSql = 'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)';
        for (const item of cartItems) {
            db.prepare(itemSql).run(orderId, item.product_id, item.quantity, item.price);
        }
        
        // Clear cart
        db.prepare('DELETE FROM cart WHERE ' + type + ' = ?').run(param);
        
        res.json({ 
            success: true, 
            message: 'Order placed successfully',
            orderId: orderId,
            total: totalAmount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ORDERS - GET USER ORDERS
// ============================================

/**
 * GET /api/orders
 * Get orders for a user
 */
app.get('/api/orders', (req, res) => {
    try {
        const db = getDb();
        const { user_id } = req.query;
        
        const sql = `
            SELECT o.*, GROUP_CONCAT(p.name) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `;
        
        const orders = db.prepare(sql).all(user_id);
        res.json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ORDERS - GET SINGLE ORDER
// ============================================

/**
 * GET /api/orders/:id
 * Get single order details
 */
app.get('/api/orders/:id', (req, res) => {
    try {
        const db = getDb();
        
        // Get order
        const orderSql = 'SELECT * FROM orders WHERE id = ?';
        const order = db.prepare(orderSql).get(req.params.id);
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Get order items
        const itemsSql = `
            SELECT oi.*, p.name, p.image
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `;
        const items = db.prepare(itemsSql).all(req.params.id);
        
        res.json({ success: true, data: { ...order, items } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN - LOGIN
// ============================================

/**
 * POST /api/admin/login
 * Admin login
 */
app.post('/api/admin/login', (req, res) => {
    try {
        const db = getDb();
        const bcrypt = require('bcryptjs');
        
        const { email, password } = req.body;
        
        const sql = 'SELECT * FROM users WHERE email = ? AND role = ?';
        const user = db.prepare(sql).get(email, 'admin');
        
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
        }
        
        const { password: _, ...userInfo } = user;
        
        res.json({ 
            success: true, 
            message: 'Admin login successful',
            user: userInfo
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ============================================
// ADMIN - CATEGORIES CRUD
// ============================================

/**
 * GET /api/admin/categories
 * Get all categories (including inactive)
 */
app.get('/api/admin/categories', (req, res) => {
    try {
        const db = getDb();
        const sql = 'SELECT * FROM categories ORDER BY name';
        const categories = db.prepare(sql).all();
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/admin/categories
 * Add new category
 */
app.post('/api/admin/categories', (req, res) => {
    try {
        const db = getDb();
        const { name, icon, description } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const sql = 'INSERT INTO categories (name, slug, icon, description) VALUES (?, ?, ?, ?)';
        const result = db.prepare(sql).run(name, slug, icon || '', description || '');

        res.json({ 
            success: true, 
            message: 'Category added successfully',
            id: result.lastInsertRowid
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/admin/categories/:id
 * Update category
 */
app.put('/api/admin/categories/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, icon, description, active } = req.body;
        const { id } = req.params;

        const sql = `
            UPDATE categories SET 
                name = COALESCE(?, name),
                icon = COALESCE(?, icon),
                description = COALESCE(?, description),
                active = COALESCE(?, active)
            WHERE id = ?
        `;

        db.prepare(sql).run(name, icon, description, active, id);

        res.json({ success: true, message: 'Category updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/admin/categories/:id
 * Delete category
 */
app.delete('/api/admin/categories/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN - PRODUCTS CRUD
// ============================================

/**
 * GET /api/admin/products
 * Get all products (admin view)
 */
app.get('/api/admin/products', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            ORDER BY p.created_at DESC
        `;
        const products = db.prepare(sql).all();
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/admin/products
 * Add new product
 */
app.post('/api/admin/products', (req, res) => {
    try {
        const db = getDb();
        const { v4: uuidv4 } = require('uuid');

        const {
            name,
            description,
            price,
            original_price,
            category_id,
            image,
            stock_status,
            returnable,
            quantity,
            unit,
            brand,
            featured,
            active
        } = req.body;

        if (!name || !price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name and price are required' 
            });
        }

        const productId = uuidv4();

        const sql = `
            INSERT INTO products (
                id, name, description, price, original_price, category_id, 
                image, stock_status, returnable, quantity, unit, brand, 
                featured, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.prepare(sql).run(
            productId,
            name,
            description || '',
            price,
            original_price || null,
            category_id || null,
            image || '',
            stock_status || 'IN_STOCK',
            returnable !== undefined ? (returnable ? 1 : 0) : 1,
            quantity || 0,
            unit || 'piece',
            brand || '',
            featured ? 1 : 0,
            active !== undefined ? active : 1
        );

        res.json({ 
            success: true, 
            message: 'Product added successfully',
            id: productId
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/admin/products/:id
 * Update product
 */
app.put('/api/admin/products/:id', (req, res) => {
    try {
        const db = getDb();

        const {
            name,
            description,
            price,
            original_price,
            category_id,
            image,
            stock_status,
            returnable,
            quantity,
            unit,
            brand,
            featured,
            active
        } = req.body;

        const sql = `
            UPDATE products SET
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                price = COALESCE(?, price),
                original_price = COALESCE(?, original_price),
                category_id = COALESCE(?, category_id),
                image = COALESCE(?, image),
                stock_status = COALESCE(?, stock_status),
                returnable = COALESCE(?, returnable),
                quantity = COALESCE(?, quantity),
                unit = COALESCE(?, unit),
                brand = COALESCE(?, brand),
                featured = COALESCE(?, featured),
                active = COALESCE(?, active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        db.prepare(sql).run(
            name,
            description,
            price,
            original_price,
            category_id,
            image,
            stock_status,
            returnable,
            quantity,
            unit,
            brand,
            featured,
            active,
            req.params.id
        );

        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PATCH /api/admin/products/:id/stock
 * Update stock status (IN_STOCK / OUT_OF_STOCK)
 */
app.patch('/api/admin/products/:id/stock', (req, res) => {
    try {
        const db = getDb();
        const { stock_status } = req.body;

        const validStatuses = ['IN_STOCK', 'OUT_OF_STOCK'];
        if (!validStatuses.includes(stock_status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid stock status' 
            });
        }

        db.prepare('UPDATE products SET stock_status = ? WHERE id = ?')
            .run(stock_status, req.params.id);

        res.json({ success: true, message: 'Stock status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PATCH /api/admin/products/:id/returnable
 * Update returnable status
 */
app.patch('/api/admin/products/:id/returnable', (req, res) => {
    try {
        const db = getDb();
        const { returnable } = req.body;

        db.prepare('UPDATE products SET returnable = ? WHERE id = ?')
            .run(returnable ? 1 : 0, req.params.id);

        res.json({ success: true, message: 'Returnable status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/admin/products/:id
 * Delete product
 */
app.delete('/api/admin/products/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN - ORDERS MANAGEMENT
// ============================================

/**
 * GET /api/admin/orders
 * Get all orders
 */
app.get('/api/admin/orders', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT o.*, u.name as customer_name, u.email as customer_email 
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            ORDER BY o.created_at DESC
        `;
        const orders = db.prepare(sql).all();
        res.json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/admin/orders/:id
 * Get single order details
 */
app.get('/api/admin/orders/:id', (req, res) => {
    try {
        const db = getDb();

        const orderSql = `
            SELECT o.*, u.name as customer_name, u.email as customer_email, 
                   u.phone as customer_phone, u.address as customer_address 
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            WHERE o.id = ?
        `;
        const order = db.prepare(orderSql).get(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemsSql = `
            SELECT oi.*, p.name, p.image 
            FROM order_items oi 
            JOIN products p ON oi.product_id = p.id 
            WHERE oi.order_id = ?
        `;
        const items = db.prepare(itemsSql).all(req.params.id);

        res.json({ success: true, data: { ...order, items } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/admin/orders/:id/status
 * Update order status
 */
app.put('/api/admin/orders/:id/status', (req, res) => {
    try {
        const db = getDb();
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid order status' 
            });
        }

        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);

        res.json({ success: true, message: 'Order status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN - DASHBOARD STATS
// ============================================

/**
 * GET /api/admin/stats
 * Get dashboard statistics
 */
app.get('/api/admin/stats', (req, res) => {
    try {
        const db = getDb();

        const stats = {
            totalProducts: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
            totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
            totalUsers: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count,
            totalRevenue: db.prepare("SELECT SUM(total_amount) as sum FROM orders WHERE status != 'cancelled'").get().sum || 0,
            pendingOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count,
            outOfStock: db.prepare("SELECT COUNT(*) as count FROM products WHERE stock_status = 'OUT_OF_STOCK'").get().count,
            returnableProducts: db.prepare("SELECT COUNT(*) as count FROM products WHERE returnable = 1").get().count,
            nonReturnableProducts: db.prepare("SELECT COUNT(*) as count FROM products WHERE returnable = 0").get().count,
            deliveredOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'delivered'").get().count,
            cancelledOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'").get().count,
            categoriesCount: db.prepare('SELECT COUNT(*) as count FROM categories').get().count,
            activeProducts: db.prepare("SELECT COUNT(*) as count FROM products WHERE active = 1").get().count
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN - USERS MANAGEMENT
// ============================================

/**
 * GET /api/admin/users
 * Get all users
 */
app.get('/api/admin/users', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT id, name, email, phone, address, role, created_at 
            FROM users 
            ORDER BY created_at DESC
        `;
        const users = db.prepare(sql).all();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/admin/users/:id
 * Update user
 */
app.put('/api/admin/users/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, phone, address, role } = req.body;

        const sql = `
            UPDATE users SET
                name = COALESCE(?, name),
                phone = COALESCE(?, phone),
                address = COALESCE(?, address),
                role = COALESCE(?, role)
            WHERE id = ?
        `;

        db.prepare(sql).run(name, phone, address, role, req.params.id);

        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user
 */
app.delete('/api/admin/users/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ============================================
// DATABASE MANAGEMENT
// ============================================

/**
 * GET /api/admin/database
 * Get database information
 */
app.get('/api/admin/database', (req, res) => {
    try {
        const db = getDb();
        
        const tables = ['users', 'categories', 'products', 'orders', 'order_items', 'cart'];
        const dbInfo = {};
        
        for (const table of tables) {
            try {
                const count = db.prepare('SELECT COUNT(*) as count FROM ' + table).get().count;
                dbInfo[table] = { count };
            } catch (e) {
                dbInfo[table] = { error: 'Table not found' };
            }
        }
        
        res.json({ success: true, data: dbInfo });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/admin/database/reset
 * Reset database (WARNING: Deletes all data except admin)
 */
app.post('/api/admin/database/reset', (req, res) => {
    try {
        const db = getDb();
        const { confirm } = req.body;
        
        if (confirm !== 'RESET') {
            return res.status(400).json({ 
                success: false, 
                message: 'Must send confirm: "RESET" to reset database' 
            });
        }
        
        // Delete all data from tables
        db.exec('DELETE FROM order_items');
        db.exec('DELETE FROM orders');
        db.exec('DELETE FROM cart');
        db.exec('DELETE FROM products');
        db.exec('DELETE FROM categories');
        db.exec('DELETE FROM users WHERE role != "admin"');
        
        // Re-create tables
        const { v4: uuidv4 } = require('uuid');
        const bcrypt = require('bcryptjs');
        
        // Seed categories
        const categories = [
            { name: 'Chicken, Meat & Fish', icon: '??' },
            { name: 'Pet Care', icon: '??' },
            { name: 'Baby Care', icon: '??' },
            { name: 'Sweet Tooth', icon: '??' },
            { name: 'Tea, Coffee & Health Drinks', icon: '?' },
            { name: 'Beauty & Cosmetics', icon: '??' },
            { name: 'Dairy, Bread & Eggs', icon: '??' },
            { name: 'Breakfast & Instant Food', icon: '??' },
            { name: 'Flour, Rice & Pulses', icon: '??' },
            { name: 'Cleaning Essentials', icon: '??' },
            { name: 'Personal Care', icon: '??' },
            { name: 'Cosmetics', icon: '??' },
            { name: 'Organic & Gourmet', icon: '??' },
            { name: 'Beverages', icon: '??' },
            { name: 'Cigarettes & Tobacco', icon: '??' },
            { name: 'Pharma & Wellness', icon: '??' },
            { name: 'Cold Drinks & Juices', icon: '??' },
            { name: 'Bakery & Biscuits', icon: '??' },
            { name: 'Sauces & Spreads', icon: '??' },
            { name: 'Vegetables & Fruits', icon: '??' },
            { name: 'Deals', icon: '???' }
        ];
        
        const insertCat = db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)');
        for (const cat of categories) {
            const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            insertCat.run(cat.name, slug, cat.icon);
        }
        
        // Re-create admin user
        const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@riatamarket.com');
        if (!adminExists) {
            const adminId = uuidv4();
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)').run(
                adminId, 'Administrator', 'admin@riatamarket.com', hashedPassword, 'admin'
            );
        }
        
        res.json({ success: true, message: 'Database reset successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/admin/database/seed
 * Seed sample products
 */
app.post('/api/admin/database/seed', (req, res) => {
    try {
        const db = getDb();
        const { v4: uuidv4 } = require('uuid');
        
        // Sample products per category
        const sampleProducts = [
            { name: 'Fresh Chicken Breast', price: 250, category: 'Chicken, Meat & Fish', unit: 'kg', brand: 'Local Farm', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Mutton Curry Cut', price: 450, category: 'Chicken, Meat & Fish', unit: 'kg', brand: 'Premium Meats', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Fresh Rohu Fish', price: 180, category: 'Chicken, Meat & Fish', unit: 'kg', brand: 'River Fresh', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Dog Food Premium', price: 850, category: 'Pet Care', unit: 'pack', brand: 'PetMax', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Cat Litter', price: 320, category: 'Pet Care', unit: 'bag', brand: 'CleanPaws', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Baby Diapers Medium', price: 650, category: 'Baby Care', unit: 'pack', brand: 'BabySoft', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Baby Formula Milk', price: 1200, category: 'Baby Care', unit: 'tin', brand: 'NutriBaby', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Chocolate Cake', price: 450, category: 'Sweet Tooth', unit: 'piece', brand: 'Sweet Dreams', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Assorted Chocolates', price: 280, category: 'Sweet Tooth', unit: 'box', brand: 'ChocoWorld', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Green Tea Pack', price: 180, category: 'Tea, Coffee & Health Drinks', unit: 'pack', brand: 'TeaGardens', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Instant Coffee', price: 350, category: 'Tea, Coffee & Health Drinks', unit: 'jar', brand: 'CoffeeKing', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Face Cream', price: 420, category: 'Beauty & Cosmetics', unit: 'tube', brand: 'GlowSkin', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Lipstick Set', price: 550, category: 'Beauty & Cosmetics', unit: 'set', brand: 'ColorPop', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Fresh Milk', price: 85, category: 'Dairy, Bread & Eggs', unit: 'liter', brand: 'DairyFresh', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'White Bread', price: 45, category: 'Dairy, Bread & Eggs', unit: 'loaf', brand: 'BakeryBest', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Farm Eggs', price: 120, category: 'Dairy, Bread & Eggs', unit: 'dozen', brand: 'FarmFresh', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Oats Cereal', price: 280, category: 'Breakfast & Instant Food', unit: 'pack', brand: 'QuickEat', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Instant Noodles', price: 95, category: 'Breakfast & Instant Food', unit: 'pack', brand: 'QuickServe', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Basmati Rice 5kg', price: 450, category: 'Flour, Rice & Pulses', unit: 'bag', brand: 'RoyalRice', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Toor Dal', price: 180, category: 'Flour, Rice & Pulses', unit: 'kg', brand: 'PulsePure', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Wheat Flour', price: 95, category: 'Flour, Rice & Pulses', unit: 'kg', brand: 'GoldenFlour', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Floor Cleaner', price: 150, category: 'Cleaning Essentials', unit: 'bottle', brand: 'CleanHome', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Dish Soap', price: 85, category: 'Cleaning Essentials', unit: 'bottle', brand: 'SparkleWash', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Shampoo', price: 220, category: 'Personal Care', unit: 'bottle', brand: 'HairCare', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Toothpaste', price: 120, category: 'Personal Care', unit: 'tube', brand: 'DentalFresh', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Organic Honey', price: 380, category: 'Organic & Gourmet', unit: 'jar', brand: 'NatureGold', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Olive Oil', price: 650, category: 'Organic & Gourmet', unit: 'bottle', brand: 'Mediterranean', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Mineral Water', price: 25, category: 'Beverages', unit: 'bottle', brand: 'AquaPure', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Energy Drink', price: 65, category: 'Beverages', unit: 'can', brand: 'PowerBoost', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Colgate Toothpaste', price: 145, category: 'Cosmetics', unit: 'tube', brand: 'Colgate', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Moisturizer', price: 320, category: 'Cosmetics', unit: 'bottle', brand: 'LotionLove', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Orange Juice', price: 95, category: 'Cold Drinks & Juices', unit: 'liter', brand: 'FreshSqueeze', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Cola Pack', price: 180, category: 'Cold Drinks & Juices', unit: 'pack', brand: 'CoolBev', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Butter Cookies', price: 220, category: 'Bakery & Biscuits', unit: 'box', brand: 'CookieHouse', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Marie Biscuits', price: 75, category: 'Bakery & Biscuits', unit: 'pack', brand: 'BiscuitBest', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Ketchup', price: 120, category: 'Sauces & Spreads', unit: 'bottle', brand: 'TomatoKing', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Peanut Butter', price: 280, category: 'Sauces & Spreads', unit: 'jar', brand: 'NutButter', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Fresh Tomatoes', price: 60, category: 'Vegetables & Fruits', unit: 'kg', brand: 'FarmFresh', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Bananas', price: 50, category: 'Vegetables & Fruits', unit: 'dozen', brand: 'TropicalFresh', stock_status: 'IN_STOCK', returnable: 0 },
            { name: 'Apples', price: 180, category: 'Vegetables & Fruits', unit: 'kg', brand: 'OrchardBest', stock_status: 'IN_STOCK', returnable: 1 },
            { name: 'Weekly Deal Bundle', price: 999, category: 'Deals', unit: 'bundle', brand: 'Riata', stock_status: 'IN_STOCK', returnable: 1, featured: 1, original_price: 1500 }
        ];
        
        // Get category IDs
        const insertProduct = db.prepare(`
            INSERT INTO products (id, name, price, category_id, unit, brand, stock_status, returnable, featured, original_price, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);
        
        for (const product of sampleProducts) {
            const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(product.category);
            if (category) {
                insertProduct.run(
                    uuidv4(),
                    product.name,
                    product.price,
                    category.id,
                    product.unit,
                    product.brand,
                    product.stock_status,
                    product.returnable,
                    product.featured || 0,
                    product.original_price || null
                );
            }
        }
        
        const insertedCount = sampleProducts.length;
        res.json({ success: true, message: 'Seeded ' + insertedCount + ' sample products' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// FRONTEND PAGES
// ============================================

/**
 * GET /
 * Serve main store frontend
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /admin
 * Serve admin panel
 */
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Endpoint not found' 
    });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('');
    console.log('+---------------------------------------+');
    console.log('¦                                       ¦');
    console.log('¦         ?? RIATA MARKET ??            ¦');
    console.log('¦                                       ¦');
    console.log('+---------------------------------------+');
    console.log('');
    console.log('  ?? Store URL:    http://localhost:' + PORT);
    console.log('  ????? Admin URL:    http://localhost:' + PORT + '/admin');
    console.log('  ?? Admin Email:  admin@riatamarket.com');
    console.log('  ?? Admin Pass:  admin123');
    console.log('');
    console.log('  Status: ? Server Running');
    console.log('');
});