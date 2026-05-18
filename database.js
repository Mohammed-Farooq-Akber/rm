const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'riata.db');
let db = null;
let dbInstance = null;

async function ensureDir() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function initDatabase() {
    await ensureDir();
    
    const SQL = await initSqlJs();
    
    // Load existing database or create new
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        dbInstance = new SQL.Database(buffer);
    } else {
        dbInstance = new SQL.Database();
    }
    
    // Create tables
    dbInstance.run(`
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
    
    dbInstance.run(`
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
    
    dbInstance.run(`
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
    
    dbInstance.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            total_amount REAL NOT NULL,
            delivery_address TEXT,
            payment_method TEXT DEFAULT 'COD',
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    
    dbInstance.run(`
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
    
    dbInstance.run(`
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
    
    // Create admin user
    const adminExists = dbInstance.exec("SELECT id FROM users WHERE email = 'admin@riatamarket.com'");
    if (adminExists.length === 0) {
        const adminId = uuidv4();
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        dbInstance.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            [adminId, 'Administrator', 'admin@riatamarket.com', hashedPassword, 'admin']);
    }
    
    // Seed categories
    const catCount = dbInstance.exec("SELECT COUNT(*) as count FROM categories");
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
            dbInstance.run("INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)", [name, slug, icon]);
        });
    }
    
    saveDatabase();
    console.log('✓ Database initialized');
}

function saveDatabase() {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
    if (!dbInstance) {
        throw new Error('Database not initialized');
    }
    
    return {
        prepare: (sql) => ({
            run: (...params) => {
                dbInstance.run(sql, params);
                saveDatabase();
                return { lastInsertRowid: dbInstance.exec("SELECT last_insert_rowid()")[0]?.values[0][0] };
            },
            get: (...params) => {
                const result = dbInstance.exec(sql, params);
                if (result.length === 0 || result[0].values.length === 0) return undefined;
                const columns = result[0].columns;
                const values = result[0].values[0];
                const row = {};
                columns.forEach((col, i) => row[col] = values[i]);
                return row;
            },
            all: (...params) => {
                const result = dbInstance.exec(sql, params);
                if (result.length === 0) return [];
                const columns = result[0].columns;
                return result[0].values.map(values => {
                    const row = {};
                    columns.forEach((col, i) => row[col] = values[i]);
                    return row;
                });
            }
        }),
        exec: (sql) => {
            dbInstance.run(sql);
            saveDatabase();
        }
    };
}

module.exports = { initDatabase, getDb };
