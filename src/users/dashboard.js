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

		// Check if today's stats exist
		let stat = await prisma.dailyStat.findFirst({
			where: {
				userId,
				date: {
					gte: today,
					lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
				}
			}
		});

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
			data: stat
		});
	} catch (err) {
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

module.exports = router;
