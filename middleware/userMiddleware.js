const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access token required' 
            });
        }

        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Invalid or expired token' 
                });
            }

            // Get user from database to ensure they still exist
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId }
            });

            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            req.user = user;
            next();
        });
    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: 'Server error during authentication' 
        });
    }
};

// Middleware to validate user registration data
const validateRegistration = (req, res, next) => {
    const { name, email, password, age, heightCm, currentWeightKg, gender, healthGoal, activityLevel } = req.body;

    // Check required fields
    if (!name || !email || !password || !age || !heightCm || !currentWeightKg || !gender || !healthGoal || !activityLevel) {
        return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
        });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email format'
        });
    }

    // Password validation
    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 6 characters long'
        });
    }

    // Age validation
    if (age < 13 || age > 120) {
        return res.status(400).json({
            success: false,
            message: 'Age must be between 13 and 120'
        });
    }

    // Height validation (in cm)
    if (heightCm < 50 || heightCm > 300) {
        return res.status(400).json({
            success: false,
            message: 'Height must be between 50 and 300 cm'
        });
    }

    // Weight validation (in kg)
    if (currentWeightKg < 20 || currentWeightKg > 500) {
        return res.status(400).json({
            success: false,
            message: 'Weight must be between 20 and 500 kg'
        });
    }

    // Validate enum values
    const validGenders = ['MALE', 'FEMALE', 'OTHER'];
    const validHealthGoals = ['WEIGHT_LOSS', 'WEIGHT_GAIN', 'MAINTENANCE'];
    const validActivityLevels = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'];

    if (!validGenders.includes(gender)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid gender. Must be MALE, FEMALE, or OTHER'
        });
    }

    if (!validHealthGoals.includes(healthGoal)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid health goal. Must be WEIGHT_LOSS, WEIGHT_GAIN, or MAINTENANCE'
        });
    }

    if (!validActivityLevels.includes(activityLevel)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid activity level. Must be SEDENTARY, LIGHT, MODERATE, ACTIVE, or VERY_ACTIVE'
        });
    }

    next();
};

// Middleware to validate login data
const validateLogin = (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required'
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email format'
        });
    }

    next();
};

module.exports = {
    authenticateToken,
    validateRegistration,
    validateLogin
};