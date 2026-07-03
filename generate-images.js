const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const courses = [
    { id: 1, name: 'Full Stack Web Development', color1: '#667eea', color2: '#764ba2', filename: 'web-dev-course.jpg' },
    { id: 2, name: 'Python for Data Science', color1: '#4CAF50', color2: '#2196F3', filename: 'python-data-science.jpg' },
    { id: 3, name: 'UI/UX Design Masterclass', color1: '#FF6B6B', color2: '#FF8E53', filename: 'uiux-design.jpg' },
    { id: 4, name: 'Mobile App Development (iOS)', color1: '#FF3B30', color2: '#FF9500', filename: 'ios-dev.jpg' },
    { id: 5, name: 'Digital Marketing Pro', color1: '#F7B733', color2: '#FC4A1A', filename: 'digital-marketing.jpg' },
    { id: 6, name: 'Cloud Computing with AWS', color1: '#FF9900', color2: '#232F3E', filename: 'aws-cloud.jpg' },
    { id: 7, name: 'Artificial Intelligence Basics', color1: '#8E2DE2', color2: '#4A00E0', filename: 'ai-basics.jpg' },
    { id: 8, name: 'Cyber Security Fundamentals', color1: '#00B4DB', color2: '#0083B0', filename: 'cybersecurity.jpg' },
    { id: 9, name: 'Blockchain Development', color1: '#FF416C', color2: '#FF4B2B', filename: 'blockchain.jpg' },
    { id: 10, name: 'React Advanced Patterns', color1: '#61DAFB', color2: '#264DE4', filename: 'react-advanced.jpg' },
    { id: 11, name: 'SQL Database Design', color1: '#4479A1', color2: '#F29111', filename: 'sql-database.jpg' },
    { id: 12, name: 'DevOps Engineering', color1: '#E95420', color2: '#77216F', filename: 'devops.jpg' }
];

function generateCourseImage(course) {
    try {
        const width = 800;
        const height = 600;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Create gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, course.color1);
        gradient.addColorStop(1, course.color2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Draw decorative circles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            ctx.arc(
                Math.random() * width,
                Math.random() * height,
                Math.random() * 50 + 10,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }

        // Draw text background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, height / 2 - 100, width, 200);

        // Draw text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Wrap text
        const words = course.name.split(' ');
        let lines = [];
        let line = '';
        
        for (let word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > width - 100 && line) {
                lines.push(line);
                line = word;
            } else {
                line = testLine;
            }
        }
        lines.push(line);
        
        const lineHeight = 60;
        const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, width / 2, startY + index * lineHeight);
        });

        // Draw small course ID badge
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(`Course #${course.id}`, width / 2, startY + lines.length * lineHeight + 40);

        // Save image
        const buffer = canvas.toBuffer('image/jpeg');
        const filepath = path.join(uploadsDir, course.filename);
        fs.writeFileSync(filepath, buffer);
        console.log(`✅ Generated: ${course.filename}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to generate ${course.filename}:`, error.message);
        return false;
    }
}

// Generate all images
console.log('🚀 Starting image generation...\n');

let successCount = 0;
let failCount = 0;

courses.forEach(course => {
    const success = generateCourseImage(course);
    if (success) {
        successCount++;
    } else {
        failCount++;
    }
});

console.log(`\n📊 Summary:`);
console.log(`✅ Successfully generated: ${successCount} images`);
console.log(`❌ Failed: ${failCount} images`);
console.log(`📁 Images saved to: ${uploadsDir}`);

if (successCount === courses.length) {
    console.log(`\n🎉 All course images have been generated successfully!`);
}