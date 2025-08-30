const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../middleware/userMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

// Helper to generate random stats
function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomFloat(min, max, decimals = 1) {
	return +(Math.random() * (max - min) + min).toFixed(decimals);
}

// GET /api/dashboard/getdailystats
router.get('/getdailystats', authenticateToken, async (req, res) => {
	try {
		const userId = req.user.id;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

		// Check if today's stats exist
		let stat = await prisma.dailyStat.findFirst({
			where: {
				userId,
				date: {
					gte: today,
					lt: tomorrow
				}
			}
		});

		// Get today's activities
		const todaysActivities = await prisma.activity.findMany({
			where: {
				userId,
				date: {
					gte: today,
					lt: tomorrow
				}
			}
		});

		// Calculate activity summary
		const activityCount = todaysActivities.length;
		const totalDuration = todaysActivities.reduce((sum, activity) => sum + activity.duration, 0);
		const totalCaloriesFromActivities = todaysActivities.reduce((sum, activity) => sum + activity.caloriesBurnt, 0);

		// Calculate BMI
		let bmi = null;
		let bmiCategory = null;
		if (req.user.currentWeightKg && req.user.heightCm) {
			const heightM = req.user.heightCm / 100;
			bmi = parseFloat((req.user.currentWeightKg / (heightM * heightM)).toFixed(1));
			
			// BMI categorization
			if (bmi < 18.5) {
				bmiCategory = { category: 'Underweight', good: false };
			} else if (bmi < 25) {
				bmiCategory = { category: 'Normal', good: true };
			} else if (bmi < 30) {
				bmiCategory = { category: 'Overweight', good: false };
			} else {
				bmiCategory = { category: 'Obese', good: false };
			}
		}

		if (!stat) {
			// Generate random stats
			stat = await prisma.dailyStat.create({
				data: {
					userId,
					date: today,
					steps: getRandomInt(3000, 15000),
					activeCalories: getRandomInt(150, 800),
					heartRateAvg: getRandomFloat(60, 110, 1),
					sleepHours: getRandomFloat(5, 9, 1),
					weightKg: req.user.currentWeightKg,
				}
			});
		}

		res.json({
			success: true,
			data: {
				...stat,
				activitiesCount: activityCount,
				totalActivityDuration: totalDuration, // in minutes
				totalCaloriesFromActivities: totalCaloriesFromActivities,
				bmi: bmi,
				bmiCategory: bmiCategory
			}
		});
	} catch (err) {
        console.log(err)
		res.status(500).json({ success: false, message: 'No stats found for today' });
	}
});

module.exports = router;
