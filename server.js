const ws = require('ws');
global.WebSocket = ws;
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js'); // إدخال مكتبة Supabase

const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_key';

// ================== SUPABASE CONFIGURATION ==================
const SUPABASE_URL = 'https://hycuyavlnnvfplyyrgcj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});
// ================== CORS ==================
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : [];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.length === 0) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json());

// ================== DATABASE CONNECTION ==================
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }

    console.log('Connected to database');

    if (connection) {
        connection.release();
    }
});

// ================== MULTER CONFIGURATION (MEMORY) ==================
// تعديل: الحفظ في الذاكرة المؤقتة (Buffer) بدلاً من القرص لرفعها مباشرة إلى Supabase
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ================== TEST ROUTE ==================
app.get('/', (req, res) => {
    res.send('API is running...');
});

// ================== AUTHENTICATION MIDDLEWARE ==================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.user_type !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
};

// ================== AUTH ROUTES ==================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = ? OR email = ?';

    db.query(query, [username, username], async (err, results) => {
        if (err) {
            console.error('Login database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = results[0];
        let validPassword = false;

        if (user.password.length === 60 && user.password.startsWith('$2')) {
            validPassword = await bcrypt.compare(password, user.password);
        } else {
            validPassword = password === user.password;
        }

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            {
                user_id: user.user_id,
                username: user.username,
                user_type: user.user_type
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                user_type: user.user_type
            }
        });
    });
});

// ================== COURSE ROUTES ==================
app.get('/api/courses', (req, res) => {
    const query = 'SELECT * FROM courses ORDER BY course_id DESC';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching courses:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(results);
    });
});

app.get('/api/courses/:id', (req, res) => {
    const query = 'SELECT * FROM courses WHERE course_id = ?';

    db.query(query, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error fetching course:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json(results[0]);
    });
});

app.post('/api/courses', authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
    const { course_name, description, hours, lesson, price, discount, status } = req.body;
    let imageUrl = 'default.jpg';

    if (req.file) {
        try {
            const fileName = `${Date.now()}_${req.file.originalname}`;

            // 1. الرفع إلى Supabase Storage داخل باكت 'course-images'
            const { data, error } = await supabase.storage
                .from('course-images')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (error) {
                console.error('Supabase upload error:', error);
                return res.status(500).json({ error: 'Failed to upload image to Supabase' });
            }

            // 2. جلب الرابط العام المباشر للصورة المرفوعة
            const { data: publicUrlData } = supabase.storage
                .from('course-images')
                .getPublicUrl(fileName);

            imageUrl = publicUrlData.publicUrl;
        } catch (catchErr) {
            console.error('Upload process failed:', catchErr);
            return res.status(500).json({ error: 'Server error during upload' });
        }
    }

    const query = `
        INSERT INTO courses 
        (course_name, description, hours, lesson, price, discount, image, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        query,
        [course_name, description, hours, lesson, price, discount, imageUrl, status],
        (err, result) => {
            if (err) {
                console.error('Error creating course:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({
                message: 'Course created with Supabase image',
                course_id: result.insertId,
                imageUrl: imageUrl
            });
        }
    );
});

app.put('/api/courses/:id', authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
    const { course_name, description, hours, lesson, price, discount, status } = req.body;

    let query = `
        UPDATE courses 
        SET course_name=?, description=?, hours=?, lesson=?, price=?, discount=?, status=?
    `;
    let params = [course_name, description, hours, lesson, price, discount, status];

    if (req.file) {
        try {
            const fileName = `${Date.now()}_${req.file.originalname}`;

            const { data, error } = await supabase.storage
                .from('course-images')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (error) {
                console.error('Supabase update upload error:', error);
                return res.status(500).json({ error: 'Failed to upload new image' });
            }

            const { data: publicUrlData } = supabase.storage
                .from('course-images')
                .getPublicUrl(fileName);

            query += `, image=?`;
            params.push(publicUrlData.publicUrl);
        } catch (catchErr) {
            console.error('Update image process failed:', catchErr);
            return res.status(500).json({ error: 'Server error during image update' });
        }
    }

    query += ` WHERE course_id=?`;
    params.push(req.params.id);

    db.query(query, params, (err) => {
        if (err) {
            console.error('Error updating course:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ message: 'Course updated successfully' });
    });
});

app.delete('/api/courses/:id', authenticateToken, isAdmin, (req, res) => {
    const query = 'DELETE FROM courses WHERE course_id = ?';

    db.query(query, [req.params.id], (err) => {
        if (err) {
            console.error('Error deleting course:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ message: 'Course deleted' });
    });
});

// ================== STUDENT ROUTES ==================
app.get('/api/students', authenticateToken, isAdmin, (req, res) => {
    const query = `
        SELECT s.*, u.username, u.email, u.created_at 
        FROM students s 
        JOIN users u ON s.user_id = u.user_id
        WHERE u.user_type = 'student'
        ORDER BY s.student_id DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching students:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(results);
    });
});

app.post('/api/students', authenticateToken, isAdmin, async (req, res) => {
    const { username, email, password, full_name, phone, address } = req.body;

    const checkQuery = 'SELECT * FROM users WHERE username = ? OR email = ?';

    db.query(checkQuery, [username, email], async (err, results) => {
        if (err) {
            console.error('Error checking user:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const userQuery = `
            INSERT INTO users 
            (username, email, password, user_type) 
            VALUES (?, ?, ?, ?)
        `;

        db.query(userQuery, [username, email, hashedPassword, 'student'], (err, userResult) => {
            if (err) {
                console.error('Error creating user:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            const studentQuery = `
                INSERT INTO students 
                (user_id, full_name, phone, address) 
                VALUES (?, ?, ?, ?)
            `;

            db.query(
                studentQuery,
                [userResult.insertId, full_name, phone || '', address || ''],
                (err, studentResult) => {
                    if (err) {
                        console.error('Error creating student profile:', err);
                        db.query('DELETE FROM users WHERE user_id = ?', [userResult.insertId]);
                        return res.status(500).json({
                            error: 'Failed to create student profile'
                        });
                    }

                    res.json({
                        message: 'Student created successfully',
                        student_id: studentResult.insertId,
                        user_id: userResult.insertId
                    });
                }
            );
        });
    });
});

app.put('/api/students/:id', authenticateToken, isAdmin, (req, res) => {
    const { full_name, phone, address, email, username } = req.body;

    const studentQuery = `
        UPDATE students 
        SET full_name=?, phone=?, address=? 
        WHERE student_id=?
    `;

    db.query(studentQuery, [full_name, phone, address, req.params.id], (err) => {
        if (err) {
            console.error('Error updating student:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const userQuery = `
            UPDATE users 
            SET email=?, username=? 
            WHERE user_id = (
                SELECT user_id 
                FROM students 
                WHERE student_id=?
            )
        `;

        db.query(userQuery, [email, username, req.params.id], (err) => {
            if (err) {
                console.error('Error updating user:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({ message: 'Student updated successfully' });
        });
    });
});

app.delete('/api/students/:id', authenticateToken, isAdmin, (req, res) => {
    const getUserQuery = 'SELECT user_id FROM students WHERE student_id = ?';

    db.query(getUserQuery, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error fetching student user:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const user_id = results[0].user_id;

        db.query('DELETE FROM registrations WHERE student_id = ?', [req.params.id], (err) => {
            if (err) {
                console.error('Error deleting registrations:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            db.query('DELETE FROM students WHERE student_id = ?', [req.params.id], (err) => {
                if (err) {
                    console.error('Error deleting student:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                db.query('DELETE FROM users WHERE user_id = ?', [user_id], (err) => {
                    if (err) {
                        console.error('Error deleting user:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.json({ message: 'Student deleted successfully' });
                });
            });
        });
    });
});

// ================== ENROLLMENT ROUTES ==================
app.get('/api/enrollments', authenticateToken, isAdmin, (req, res) => {
    const query = `
        SELECT r.*, s.full_name, c.course_name, c.price AS course_price
        FROM registrations r 
        JOIN students s ON r.student_id = s.student_id 
        JOIN courses c ON r.course_id = c.course_id
        ORDER BY r.register_date DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching enrollments:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(results);
    });
});

app.get('/api/students/:studentId/courses', authenticateToken, (req, res) => {
    const query = `
        SELECT c.*, r.register_date, r.price, r.payment_status
        FROM registrations r 
        JOIN courses c ON r.course_id = c.course_id 
        WHERE r.student_id = ?
    `;

    db.query(query, [req.params.studentId], (err, results) => {
        if (err) {
            console.error('Error fetching student courses:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(results);
    });
});

app.post('/api/enrollments', authenticateToken, isAdmin, (req, res) => {
    const { student_id, course_id, price, payment_status } = req.body;

    const checkQuery = `
        SELECT * 
        FROM registrations 
        WHERE student_id = ? AND course_id = ?
    `;

    db.query(checkQuery, [student_id, course_id], (err, results) => {
        if (err) {
            console.error('Error checking enrollment:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            return res.status(400).json({
                error: 'Student already enrolled in this course'
            });
        }

        const insertQuery = `
            INSERT INTO registrations 
            (student_id, course_id, price, payment_status, register_date) 
            VALUES (?, ?, ?, ?, NOW())
        `;

        db.query(insertQuery, [student_id, course_id, price, payment_status], (err, result) => {
            if (err) {
                console.error('Error adding enrollment:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({
                message: 'Enrollment added successfully',
                register_id: result.insertId
            });
        });
    });
});

app.delete('/api/enrollments/:studentId/:courseId', authenticateToken, isAdmin, (req, res) => {
    const query = `
        DELETE FROM registrations 
        WHERE student_id = ? AND course_id = ?
    `;

    db.query(query, [req.params.studentId, req.params.courseId], (err) => {
        if (err) {
            console.error('Error deleting enrollment:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ message: 'Enrollment removed successfully' });
    });
});

// ================== COURSE MATERIALS ROUTES ==================
app.get('/api/courses/:courseId/materials', (req, res) => {
    const query = `
        SELECT * 
        FROM courselink 
        WHERE course_id = ? 
        ORDER BY link_id
    `;

    db.query(query, [req.params.courseId], (err, results) => {
        if (err) {
            console.error('Error fetching course materials:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(results);
    });
});

app.post('/api/materials', authenticateToken, isAdmin, (req, res) => {
    const { course_id, title, link } = req.body;

    const query = `
        INSERT INTO courselink 
        (course_id, title, link) 
        VALUES (?, ?, ?)
    `;

    db.query(query, [course_id, title, link], (err, result) => {
        if (err) {
            console.error('Error adding material:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({
            message: 'Material added successfully',
            link_id: result.insertId
        });
    });
});

app.put('/api/materials/:id', authenticateToken, isAdmin, (req, res) => {
    const { title, link } = req.body;

    const query = `
        UPDATE courselink 
        SET title=?, link=? 
        WHERE link_id=?
    `;

    db.query(query, [title, link, req.params.id], (err) => {
        if (err) {
            console.error('Error updating material:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ message: 'Material updated successfully' });
    });
});

app.delete('/api/materials/:id', authenticateToken, isAdmin, (req, res) => {
    const query = 'DELETE FROM courselink WHERE link_id = ?';

    db.query(query, [req.params.id], (err) => {
        if (err) {
            console.error('Error deleting material:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ message: 'Material deleted successfully' });
    });
});

// ================== STUDENT DASHBOARD ==================
app.get('/api/student/:userId/dashboard', authenticateToken, (req, res) => {
    if (req.user.user_type !== 'student' || req.user.user_id != req.params.userId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const getStudentQuery = 'SELECT * FROM students WHERE user_id = ?';

    db.query(getStudentQuery, [req.params.userId], (err, studentResults) => {
        if (err) {
            console.error('Error fetching student:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (studentResults.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const studentId = studentResults[0].student_id;

        const coursesQuery = `
            SELECT c.*, r.register_date, r.price, r.payment_status
            FROM registrations r 
            JOIN courses c ON r.course_id = c.course_id 
            WHERE r.student_id = ?
        `;

        db.query(coursesQuery, [studentId], (err, courses) => {
            if (err) {
                console.error('Error fetching dashboard courses:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({
                student: studentResults[0],
                courses: courses
            });
        });
    });
});

// ================== ADMIN DASHBOARD STATS ==================
app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
    const queries = {
        totalStudents: 'SELECT COUNT(*) AS count FROM users WHERE user_type = "student"',
        totalCourses: 'SELECT COUNT(*) AS count FROM courses',
        totalEnrollments: 'SELECT COUNT(*) AS count FROM registrations',
        totalRevenue: 'SELECT SUM(price) AS total FROM registrations WHERE payment_status = "paid"'
    };

    db.query(queries.totalStudents, (err, students) => {
        if (err) {
            console.error('Error fetching total students:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        db.query(queries.totalCourses, (err, courses) => {
            if (err) {
                console.error('Error fetching total courses:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            db.query(queries.totalEnrollments, (err, enrollments) => {
                if (err) {
                    console.error('Error fetching total enrollments:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                db.query(queries.totalRevenue, (err, revenue) => {
                    if (err) {
                        console.error('Error fetching total revenue:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.json({
                        totalStudents: students[0].count,
                        totalCourses: courses[0].count,
                        totalEnrollments: enrollments[0].count,
                        totalRevenue: revenue[0].total || 0
                    });
                });
            });
        });
    });
});

// ================== START SERVER ==================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});