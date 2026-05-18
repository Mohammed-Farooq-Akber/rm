const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

const dbPath = path.join(__dirname, process.env.DB_NAME || 'riata_market.db');
let db;

// Initialize database connection
function initDatabase() {
    try {
        db = new Database(dbPath);
        
        // Enable foreign keys
        db.pragma('FOREIGN_KEYS = ON');
        
        // Create tables
        createTables();
        
        console.log('? Database initialized successfully');
        return db;
    } catch (error) {
        console.error('? Database initialization failed:', error);
        throw error;
    }
}

// Create all necessary tables
function createTables() {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            role TEXT DEFAULT 'customer',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Categories table
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT UNIQUE NOT NULL,
            icon TEXT,
            description TEXT,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Products table
    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            original_price REAL,
            category_id INTEGER,
            image TEXT,
            stock_status TEXT DEFAULT 'IN_STOCK',
            returnable INTEGER DEFAULT 1,
            quantity INTEGER DEFAULT 0,
            unit TEXT DEFAULT 'piece',
            brand TEXT,
            featured INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    `);

    // Orders table
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            status TEXT DEFAULT 'pending',
            total_amount REAL NOT NULL,
            delivery_address TEXT,
            payment_method TEXT DEFAULT 'COD',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Order items table
    db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `);

    // Cart items table
    db.exec(`
        CREATE TABLE IF NOT EXISTS cart (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            session_id TEXT,
            product_id TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `);

    // Create default admin user if not exists
    createDefaultAdmin();
    
    // Seed categories
    seedCategories();
}

// Create default admin account
function createDefaultAdmin() {
    const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@riatamarket.com');
    
    if (!existingAdmin) {
        const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
        const { v4: uuidv4 } = require('uuid');
        
        db.prepare(`
            INSERT INTO users (id, name, email, password, role)
            VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), 'Administrator', 'admin@riatamarket.com', hashedPassword, 'admin');
        
        console.log('? Default admin account created');
    }
}

// Seed categories
function seedCategories() {
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

    const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (name, slug, icon)
        VALUES (?, ?, ?)
    `);

    categories.forEach(cat => {
        const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        insertCategory.run(cat.name, slug, cat.icon);
    });

    console.log('? Categories seeded successfully');
}

// Get database instance
function getDb() {
    if (!db) {
        initDatabase();
    }
    return db;
}

module.exports = {
    initDatabase,
    getDb
};