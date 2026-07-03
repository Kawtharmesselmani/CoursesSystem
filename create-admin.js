const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Your MySQL password (leave empty if no password)
    database: 'codelab'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        return;
    }
    console.log('✅ Connected to database');
    createAdminUsers();
});

async function createAdminUsers() {
    try {
        const password = 'password123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        console.log('\n📝 Creating admin users...');
        console.log(`Password: ${password}`);
        
        // Delete existing admin users
        await db.promise().query("DELETE FROM users WHERE user_type = 'admin'");
        console.log('✓ Removed existing admin users');
        
        // Insert Admin
        await db.promise().query(
            "INSERT INTO users (username, email, password, user_type, created_at) VALUES (?, ?, ?, 'admin', NOW())",
            ['admin', 'admin@codelab.com', hashedPassword]
        );
        console.log('✓ Admin user created');
        
        // Insert Superadmin
        await db.promise().query(
            "INSERT INTO users (username, email, password, user_type, created_at) VALUES (?, ?, ?, 'admin', NOW())",
            ['superadmin', 'superadmin@codelab.com', hashedPassword]
        );
        console.log('✓ Superadmin user created');
        
        // Verify
        const [results] = await db.promise().query(
            "SELECT user_id, username, email, user_type FROM users WHERE user_type = 'admin'"
        );
        
        console.log('\n📊 Admin Users:');
        console.table(results);
        
        console.log('\n✅ You can now login with:');
        console.log('   Username: admin');
        console.log('   Password: password123');
        console.log('\n   Username: superadmin');
        console.log('   Password: password123');
        
        db.end();
    } catch (error) {
        console.error('❌ Error:', error);
        db.end();
    }
}