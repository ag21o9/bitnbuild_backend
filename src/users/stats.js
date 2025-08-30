
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../middleware/userMiddleware');
const { OpenAI } = require('openai');
// const { ChatOpenAI } = require('@langchain/openai')
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { z } = require('zod');
const { StructuredOutputParser } = require('langchain/output_parsers');

const router = express.Router();
const prisma = new PrismaClient();

// BMI Categories
const getBMICategory = (bmi) => {
    if (bmi < 18.5) return { category: 'Underweight', good: false };
    if (bmi < 25) return { category: 'Normal', good: true };
    if (bmi < 30) return { category: 'Overweight', good: false };
    return { category: 'Obese', good: false };
};

// Calories burnt per minute for activities (approximate)
const activityCalories = {
    walking: 4, // kcal/min
    running: 10,
    swimming: 8,
    cycling: 7,
    yoga: 3,
    skipping: 12,
    dancing: 6,
    weightlifting: 6
};

// Helper: Calculate calories burnt for an activity
function calculateCalories(activity, minutes, weightKg) {
    const met = activityCalories[activity.toLowerCase()];
    if (!met) return null;
    // Formula: kcal/min * weight factor (weight/70kg)
    return Math.round(met * minutes * (weightKg / 70));
}

// Strict output parser for meal plan suggestions
const mealPlanParser = StructuredOutputParser.fromZodSchema(
    z.object({
        mealPlan: z.string(),
        suggestions: z.string()
    })
);

// Strict output parser for activity calorie suggestions
const activityParser = StructuredOutputParser.fromZodSchema(
    z.object({
        calorieBurnt: z.number(),
        suggestions: z.string()
    })
);

// Strict output parser for meal suggestions
const mealSuggestionParser = StructuredOutputParser.fromZodSchema(
    z.object({
        totalCalories: z.number(),
        proteinGrams: z.number(),
        carbsGrams: z.number(),
        fatsGrams: z.number(),
        suggestions: z.string(),
        nextMealRecommendation: z.string()
    })
);

// Strict output parser for weight goal suggestions
const weightGoalParser = StructuredOutputParser.fromZodSchema(
    z.object({
        suggestedMealPlan: z.string(),
        suggestedExercise: z.string(),
        toAvoid: z.string()
    })
);

// Strict output parser for chat responses
const chatResponseParser = StructuredOutputParser.fromZodSchema(
    z.object({
        isRelevant: z.boolean(),
        response: z.string()
    })
);

// LangChain/OpenAI setup
// const llm = new ChatOpenAI({
//     openAIApiKey: process.env.OPENAI_API_KEY,
//     modelName: 'gpt-3.5-turbo',
//     temperature: 0.2
// });

const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.2,
    maxRetries: 2,
});


router.post('/bmi', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { heightCm, currentWeightKg } = user;
        const heightM = heightCm / 100;
        const bmi = +(currentWeightKg / (heightM * heightM)).toFixed(2);
        const { category, good } = getBMICategory(bmi);

        if (good) {
            return res.json({
                bmi,
                category,
                good,
                message: 'Your BMI is in a healthy range!',
                mealPlan: "NA",
                suggestions: "NA"
            });
        }

        const prompt = `My BMI is ${bmi} (${category}). Suggest a healthy meal plan and lifestyle changes to reach a normal BMI. Output strictly as JSON with keys: mealPlan, suggestions. ${mealPlanParser.getFormatInstructions()}`;
        try {
            const result = await llm.invoke([
                ["system", "You are a fitness and nutrition expert. Respond only in the required JSON format."],
                ["user", prompt],
            ]);
            const parsed = await mealPlanParser.parse(result.content);
            return res.json({
                bmi,
                category,
                good,
                ...parsed
            });
        } catch (err) {
            console.log(err)
            return res.status(404).json({ error: 'not found, try refreshing' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Server error' });
    }
});


router.post('/activity', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { activity, minutes = 30 } = req.body;
        if (!activity) return res.status(400).json({ error: 'activity required' });
        
        let calories = calculateCalories(activity, minutes, user.currentWeightKg);
        let suggestions = '';

        // Get suggestions from LLM regardless of local estimate
        const prompt = `I did ${minutes} minutes of ${activity}. My weight is ${user.currentWeightKg}kg. Age: ${user.age}, Goal: ${user.healthGoal}. Give fitness suggestions. ${activityParser.getFormatInstructions()}`;
        
        try {
            const result = await llm.invoke(prompt);
            const parsed = await activityParser.parse(result.content);
            
            // Use AI calorie estimate if local calculation failed
            if (!calories) {
                calories = parsed.calorieBurnt;
            }
            suggestions = parsed.suggestions;

            // Store activity in database
            const storedActivity = await prisma.activity.create({
                data: {
                    userId: user.id,
                    activityName: activity,
                    duration: minutes,
                    caloriesBurnt: calories,
                    suggestions: suggestions,
                    date: new Date()
                }
            });

            return res.json({
                success: true,
                message: 'Activity logged successfully',
                data: {
                    calorieBurnt: calories,
                    suggestions: suggestions
                }
            });

        } catch (err) {
            console.error('Activity AI error:', err);
            
            // If AI fails but we have local calorie estimate, still store it
            if (calories) {
                const storedActivity = await prisma.activity.create({
                    data: {
                        userId: user.id,
                        activityName: activity,
                        duration: minutes,
                        caloriesBurnt: calories,
                        suggestions: 'AI suggestions temporarily unavailable',
                        date: new Date()
                    }
                });

                return res.json({
                    success: true,
                    message: 'Activity logged successfully',
                    data: {
                        calorieBurnt: calories,
                        suggestions: 'Great job completing your workout! Keep up the good work.'
                    }
                });
            }
            
            return res.status(404).json({ error: 'not found, try refreshing' });
        }
    } catch (err) {
        console.error('Activity endpoint error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/stats/activities - Get all user activities
router.get('/activities', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, activityName, startDate, endDate } = req.query;
        const skip = (page - 1) * limit;

        // Build where condition
        let whereCondition = { userId };

        // Filter by activity name if provided
        if (activityName) {
            whereCondition.activityName = {
                contains: activityName,
                mode: 'insensitive'
            };
        }

        // Filter by date range if provided
        if (startDate || endDate) {
            whereCondition.date = {};
            if (startDate) {
                const start = new Date(startDate);
                if (!isNaN(start.getTime())) {
                    whereCondition.date.gte = start;
                }
            }
            if (endDate) {
                const end = new Date(endDate);
                if (!isNaN(end.getTime())) {
                    // Set to end of day
                    end.setHours(23, 59, 59, 999);
                    whereCondition.date.lte = end;
                }
            }
        }

        const activities = await prisma.activity.findMany({
            where: whereCondition,
            orderBy: { date: 'desc' },
            skip: parseInt(skip),
            take: parseInt(limit)
        });

        const totalActivities = await prisma.activity.count({ where: whereCondition });

        // Calculate total calories burnt
        const totalCalories = activities.reduce((sum, activity) => sum + activity.caloriesBurnt, 0);

        res.status(200).json({
            success: true,
            message: 'Activities retrieved successfully',
            data: {
                activities,
                summary: {
                    totalActivities: activities.length,
                    totalCaloriesBurnt: Math.round(totalCalories),
                    averageCaloriesPerActivity: activities.length > 0 ? Math.round(totalCalories / activities.length) : 0
                },
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalActivities / limit),
                    totalActivities,
                    hasNext: (page * limit) < totalActivities,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Activities fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching activities'
        });
    }
});

// GET /api/stats/activities/:date - Get activities for a specific date
router.get('/activities/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { date } = req.params;

        // Parse the date
        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Set to start and end of day
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

        const activities = await prisma.activity.findMany({
            where: {
                userId,
                date: {
                    gte: targetDate,
                    lt: nextDay
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Calculate total calories for the day
        const totalCalories = activities.reduce((sum, activity) => sum + activity.caloriesBurnt, 0);
        const totalDuration = activities.reduce((sum, activity) => sum + activity.duration, 0);

        res.status(200).json({
            success: true,
            message: `Activities for ${date} retrieved successfully`,
            data: {
                date: date,
                activities,
                summary: {
                    totalActivities: activities.length,
                    totalDuration: totalDuration,
                    totalCaloriesBurnt: Math.round(totalCalories),
                    averageCaloriesPerActivity: activities.length > 0 ? Math.round(totalCalories / activities.length) : 0
                }
            }
        });

    } catch (error) {
        console.error('Daily activities fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching daily activities'
        });
    }
});

// GET /api/stats/activities/summary - Get activity summary statistics
router.get('/activities/summary', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { days = 7 } = req.query; // Default to last 7 days

        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));
        daysAgo.setHours(0, 0, 0, 0);

        const activities = await prisma.activity.findMany({
            where: {
                userId,
                date: {
                    gte: daysAgo
                }
            },
            orderBy: { date: 'desc' }
        });

        // Calculate statistics
        const totalActivities = activities.length;
        const totalCalories = activities.reduce((sum, activity) => sum + activity.caloriesBurnt, 0);
        const totalDuration = activities.reduce((sum, activity) => sum + activity.duration, 0);

        // Group by activity type
        const activityBreakdown = activities.reduce((acc, activity) => {
            const name = activity.activityName.toLowerCase();
            if (!acc[name]) {
                acc[name] = {
                    count: 0,
                    totalCalories: 0,
                    totalDuration: 0
                };
            }
            acc[name].count++;
            acc[name].totalCalories += activity.caloriesBurnt;
            acc[name].totalDuration += activity.duration;
            return acc;
        }, {});

        // Get most frequent activity
        const mostFrequentActivity = Object.entries(activityBreakdown)
            .sort(([,a], [,b]) => b.count - a.count)[0];

        res.status(200).json({
            success: true,
            message: `Activity summary for last ${days} days retrieved successfully`,
            data: {
                period: `Last ${days} days`,
                summary: {
                    totalActivities,
                    totalCalories: Math.round(totalCalories),
                    totalDuration: totalDuration,
                    averageCaloriesPerDay: Math.round(totalCalories / parseInt(days)),
                    averageDurationPerDay: Math.round(totalDuration / parseInt(days)),
                    mostFrequentActivity: mostFrequentActivity ? {
                        name: mostFrequentActivity[0],
                        count: mostFrequentActivity[1].count,
                        totalCalories: Math.round(mostFrequentActivity[1].totalCalories)
                    } : null
                },
                activityBreakdown
            }
        });

    } catch (error) {
        console.error('Activity summary fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching activity summary'
        });
    }
});


router.post('/meal', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { breakfast, lunch, dinner, snacks } = req.body;

        if (!breakfast && !lunch && !dinner) {
            return res.status(400).json({
                success: false,
                message: 'At least one meal (breakfast, lunch, or dinner) is required'
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if today's meal plan already exists
        let mealPlan = await prisma.mealPlan.findFirst({
            where: {
                userId: user.id,
                date: {
                    gte: today,
                    lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        });

        const mealDescription = `Breakfast: ${breakfast || 'None'}, Lunch: ${lunch || 'None'}, Dinner: ${dinner || 'None'}, Snacks: ${snacks || 'None'}`;

        // Get AI analysis of the meals
        const prompt = `User profile: Weight ${user.currentWeightKg}kg, Height ${user.heightCm}cm, Age ${user.age}, Goal: ${user.healthGoal}, Activity: ${user.activityLevel}. 
        Today's meals: ${mealDescription}. 
        Analyze these meals and provide nutritional breakdown and suggestions for what to have next. 
        ${mealSuggestionParser.getFormatInstructions()}`;

        let aiResponse;
        try {
            const result = await llm.invoke(prompt);
            aiResponse = await mealSuggestionParser.parse(result.content);
        } catch (err) {
            console.error('AI parsing error:', err);
            return res.status(404).json({ error: 'not found, try refreshing' });
        }

        if (mealPlan) {

            mealPlan = await prisma.mealPlan.update({
                where: { id: mealPlan.id },
                data: {
                    breakfast: breakfast || mealPlan.breakfast,
                    lunch: lunch || mealPlan.lunch,
                    dinner: dinner || mealPlan.dinner,
                    snacks: snacks || mealPlan.snacks,
                    totalCalories: aiResponse.totalCalories,
                    proteinGrams: aiResponse.proteinGrams,
                    carbsGrams: aiResponse.carbsGrams,
                    fatsGrams: aiResponse.fatsGrams
                }
            });
        } else {
            mealPlan = await prisma.mealPlan.create({
                data: {
                    userId: user.id,
                    date: today,
                    breakfast: breakfast || '',
                    lunch: lunch || '',
                    dinner: dinner || '',
                    snacks: snacks || '',
                    totalCalories: aiResponse.totalCalories,
                    proteinGrams: aiResponse.proteinGrams,
                    carbsGrams: aiResponse.carbsGrams,
                    fatsGrams: aiResponse.fatsGrams
                }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Meal plan updated successfully',
            data: {
                mealPlan,
                suggestions: aiResponse.suggestions,
                nextMealRecommendation: aiResponse.nextMealRecommendation
            }
        });

    } catch (error) {
        console.error('Meal logging error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during meal logging'
        });
    }
});

router.get('/meals', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const mealPlans = await prisma.mealPlan.findMany({
            where: { userId },
            orderBy: { date: 'desc' }
        });

        res.status(200).json({
            success: true,
            message: 'Meal plans retrieved successfully',
            data: {
                mealPlans,
                total: mealPlans.length
            }
        });

    } catch (error) {
        console.error('Meal plans fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching meal plans'
        });
    }
});

router.get('/meals/:date', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { date } = req.params;

        // Parse the date
        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Set to start of day
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

        const mealPlan = await prisma.mealPlan.findFirst({
            where: {
                userId,
                date: {
                    gte: targetDate,
                    lt: nextDay
                }
            }
        });

        if (!mealPlan) {
            return res.status(404).json({
                success: false,
                message: 'No meal plan found for this date'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Meal plan retrieved successfully',
            data: {
                mealPlan
            }
        });

    } catch (error) {
        console.error('Meal plan fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching meal plan'
        });
    }
});

router.post('/weight-goal', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { targetWeight } = req.body;

        if (!targetWeight || typeof targetWeight !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'Target weight is required and must be a number'
            });
        }

        if (targetWeight < 20 || targetWeight > 500) {
            return res.status(400).json({
                success: false,
                message: 'Target weight must be between 20 and 500 kg'
            });
        }

        const currentWeight = user.currentWeightKg;
        const weightDifference = targetWeight - currentWeight;
        const heightM = user.heightCm / 100;
        const currentBMI = +(currentWeight / (heightM * heightM)).toFixed(2);
        const targetBMI = +(targetWeight / (heightM * heightM)).toFixed(2);

        let goalType;
        if (Math.abs(weightDifference) < 1) {
            goalType = "maintenance";
        } else if (weightDifference > 0) {
            goalType = "weight gain";
        } else {
            goalType = "weight loss";
        }

        // Create comprehensive prompt for LangChain
        const prompt = `User Profile:
- Name: ${user.name}
- Current Weight: ${currentWeight}kg
- Target Weight: ${targetWeight}kg
- Weight Change Needed: ${Math.abs(weightDifference).toFixed(1)}kg (${goalType})
- Height: ${user.heightCm}cm
- Age: ${user.age}
- Gender: ${user.gender}
- Current BMI: ${currentBMI}
- Target BMI: ${targetBMI}
- Health Goal: ${user.healthGoal}
- Activity Level: ${user.activityLevel}

Please provide a comprehensive plan to achieve the target weight safely and effectively.
${weightGoalParser.getFormatInstructions()}

Respond with detailed meal plan, exercise recommendations, and things to avoid.`;

        try {
            const result = await llm.invoke(prompt);
            const parsed = await weightGoalParser.parse(result.content);

            res.status(200).json({
                success: true,
                message: 'Weight goal suggestions generated successfully',
                data: {
                    userProfile: {
                        currentWeight: currentWeight,
                        targetWeight: targetWeight,
                        weightToChange: weightDifference,
                        goalType: goalType,
                        currentBMI: currentBMI,
                        targetBMI: targetBMI
                    },
                    suggestions: {
                        suggestedMealPlan: parsed.suggestedMealPlan,
                        suggestedExercise: parsed.suggestedExercise,
                        toAvoid: parsed.toAvoid
                    }
                }
            });

        } catch (error) {
            console.error('Weight goal AI error:', error);
            return res.status(404).json({
                success: false,
                error: 'not found, try refreshing'
            });
        }

    } catch (error) {
        console.error('Weight goal error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during weight goal analysis'
        });
    }
});


// POST /api/stats/chat - Fitness and health chat assistant
router.post('/chat', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { message } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message is required and must be a non-empty string'
            });
        }

        // Get today's data for context
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get today's daily stats
        const todayStats = await prisma.dailyStat.findFirst({
            where: {
                userId: user.id,
                date: {
                    gte: today,
                    lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        });

        // Get today's meal plan
        const todayMeals = await prisma.mealPlan.findFirst({
            where: {
                userId: user.id,
                date: {
                    gte: today,
                    lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        });

        // Calculate BMI
        const heightM = user.heightCm / 100;
        const bmi = +(user.currentWeightKg / (heightM * heightM)).toFixed(2);

        // Create comprehensive user context
        const userContext = `
User Profile:
- Name: ${user.name}
- Age: ${user.age}
- Gender: ${user.gender}
- Height: ${user.heightCm}cm
- Current Weight: ${user.currentWeightKg}kg
- Target Weight: ${user.targetWeightKg || 'Not set'}kg
- BMI: ${bmi}
- Health Goal: ${user.healthGoal}
- Activity Level: ${user.activityLevel}
- Target Deadline: ${user.targetDeadline ? new Date(user.targetDeadline).toDateString() : 'Not set'}

Today's Stats:
${todayStats ? `
- Steps: ${todayStats.steps}
- Active Calories: ${todayStats.activeCalories}
- Heart Rate Avg: ${todayStats.heartRateAvg} bpm
- Sleep Hours: ${todayStats.sleepHours}
- Weight: ${todayStats.weightKg}kg
` : '- No daily stats recorded yet'}

Today's Meals:
${todayMeals ? `
- Breakfast: ${todayMeals.breakfast}
- Lunch: ${todayMeals.lunch}
- Dinner: ${todayMeals.dinner}
- Snacks: ${todayMeals.snacks || 'None'}
- Total Calories: ${todayMeals.totalCalories}
- Protein: ${todayMeals.proteinGrams}g
- Carbs: ${todayMeals.carbsGrams}g
- Fats: ${todayMeals.fatsGrams}g
` : '- No meals recorded yet'}
`;

        // First check if the question is fitness/health related
        const relevancePrompt = `
You are a strict fitness and health assistant. Your job is to determine if a user's question is related to fitness, health, nutrition, exercise, wellness, or medical topics.

User Question: "${message}"

Determine if this question is relevant to fitness, health, nutrition, exercise, wellness, or medical topics. 
If the topic is even 1% diverted from these areas, mark it as irrelevant.

Examples of RELEVANT topics: exercise routines, diet plans, calories, BMI, muscle building, weight loss, sleep, heart rate, nutrition, supplements, medical conditions, injuries, recovery, mental health related to fitness.

Examples of IRRELEVANT topics: weather, entertainment, technology (unless fitness tech), politics, general knowledge, cooking recipes (unless specifically for fitness diet), shopping, travel, etc.

${chatResponseParser.getFormatInstructions()}

If isRelevant is false, set response to "I can only help with fitness, health, nutrition, and wellness related questions."
If isRelevant is true, provide a helpful response using the user's data below:

${userContext}
`;

        try {
            const result = await llm.invoke(relevancePrompt);
            const parsed = await chatResponseParser.parse(result.content);

            if (!parsed.isRelevant) {
                return res.status(200).json({
                    success: true,
                    message: 'Response generated',
                    data: {
                        response: "I can only help with fitness, health, nutrition, and wellness related questions. Please ask me about your workout routines, diet plans, health goals, or any fitness-related concerns!"
                    }
                });
            }

            res.status(200).json({
                success: true,
                message: 'Response generated successfully',
                data: {
                    response: parsed.response,
                    contextUsed: {
                        hasStats: !!todayStats,
                        hasMeals: !!todayMeals,
                        userBMI: bmi
                    }
                }
            });

        } catch (error) {
            console.error('Chat AI error:', error);
            return res.status(404).json({
                success: false,
                error: 'not found, try refreshing'
            });
        }

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during chat'
        });
    }
});


module.exports = router;