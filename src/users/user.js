const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, validateRegistration, validateLogin } = require('../../middleware/userMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Token expires in 7 days
    );
};

// User Registration
router.post('/register', validateRegistration, async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            profileImage,
            age,
            heightCm,
            currentWeightKg,
            gender,
            healthGoal,
            targetWeightKg,
            targetDeadline,
            activityLevel
        } = req.body;

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                profileImage,
                age,
                heightCm,
                currentWeightKg,
                gender,
                healthGoal,
                targetWeightKg,
                targetDeadline: targetDeadline ? new Date(targetDeadline) : null,
                activityLevel
            }
        });

        // Generate token
        const token = generateToken(newUser.id);

        // Remove password from response
        const { password: _, ...userResponse } = newUser;

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: userResponse,
                token
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during registration'
        });
    }
});

// User Login
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate token
        const token = generateToken(user.id);

        // Remove password from response
        const { password: _, ...userResponse } = user;

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: userResponse,
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
});

// Get User Profile (Protected)
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const { password: _, ...userResponse } = req.user;

        res.status(200).json({
            success: true,
            message: 'User profile retrieved successfully',
            data: {
                user: userResponse
            }
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching profile'
        });
    }
});

// Update User Information (Protected)
router.put('/update', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            name,
            profileImage,
            age,
            heightCm,
            currentWeightKg,
            gender,
            healthGoal,
            targetWeightKg,
            targetDeadline,
            activityLevel
        } = req.body;

        // Validate optional fields if provided
        if (age && (age < 13 || age > 120)) {
            return res.status(400).json({
                success: false,
                message: 'Age must be between 13 and 120'
            });
        }

        if (heightCm && (heightCm < 50 || heightCm > 300)) {
            return res.status(400).json({
                success: false,
                message: 'Height must be between 50 and 300 cm'
            });
        }

        if (currentWeightKg && (currentWeightKg < 20 || currentWeightKg > 500)) {
            return res.status(400).json({
                success: false,
                message: 'Weight must be between 20 and 500 kg'
            });
        }

        if (targetWeightKg && (targetWeightKg < 20 || targetWeightKg > 500)) {
            return res.status(400).json({
                success: false,
                message: 'Target weight must be between 20 and 500 kg'
            });
        }

        // Validate enum values if provided
        const validGenders = ['MALE', 'FEMALE', 'OTHER'];
        const validHealthGoals = ['WEIGHT_LOSS', 'WEIGHT_GAIN', 'MAINTENANCE'];
        const validActivityLevels = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'];

        if (gender && !validGenders.includes(gender)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid gender. Must be MALE, FEMALE, or OTHER'
            });
        }

        if (healthGoal && !validHealthGoals.includes(healthGoal)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid health goal. Must be WEIGHT_LOSS, WEIGHT_GAIN, or MAINTENANCE'
            });
        }

        if (activityLevel && !validActivityLevels.includes(activityLevel)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid activity level. Must be SEDENTARY, LIGHT, MODERATE, ACTIVE, or VERY_ACTIVE'
            });
        }

        // Prepare update data (only include fields that are provided)
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (profileImage !== undefined) updateData.profileImage = profileImage;
        if (age !== undefined) updateData.age = age;
        if (heightCm !== undefined) updateData.heightCm = heightCm;
        if (currentWeightKg !== undefined) updateData.currentWeightKg = currentWeightKg;
        if (gender !== undefined) updateData.gender = gender;
        if (healthGoal !== undefined) updateData.healthGoal = healthGoal;
        if (targetWeightKg !== undefined) updateData.targetWeightKg = targetWeightKg;
        if (targetDeadline !== undefined) updateData.targetDeadline = targetDeadline ? new Date(targetDeadline) : null;
        if (activityLevel !== undefined) updateData.activityLevel = activityLevel;

        // Update user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        // Remove password from response
        const { password: _, ...userResponse } = updatedUser;

        res.status(200).json({
            success: true,
            message: 'User information updated successfully',
            data: {
                user: userResponse
            }
        });

    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during update'
        });
    }
});

// Delete User Account (Protected)
router.delete('/delete', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Delete user and all related data (handled by Prisma's cascade delete)
        await prisma.user.delete({
            where: { id: userId }
        });

        res.status(200).json({
            success: true,
            message: 'User account deleted successfully'
        });

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during account deletion'
        });
    }
});

module.exports = router;