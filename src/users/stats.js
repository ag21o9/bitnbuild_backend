
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../middleware/userMiddleware');
const { OpenAI } = require('openai');
const { ChatOpenAI } = require('@langchain/openai')
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

// LangChain/OpenAI setup
const llm = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-3.5-turbo',
    temperature: 0.2
});

// POST /api/stats/bmi - Calculate BMI, categorize, and get suggestions
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
                message: 'Your BMI is in a healthy range!'
            });
        }

        // If not good, get meal plan and suggestions from LangChain
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

// POST /api/stats/activity - Calculate calories burnt for an activity
router.post('/activity', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        const { activity, minutes = 30 } = req.body;
        if (!activity) return res.status(400).json({ error: 'activity required' });
        const calories = calculateCalories(activity, minutes, user.currentWeightKg);

        // If we have a local estimate, return it and suggestions from LLM
        if (calories) {
            // Get suggestions from LLM
            const prompt = `I did ${minutes} minutes of ${activity}. My weight is ${user.currentWeightKg}kg. Give a fitness suggestion. Output strictly as JSON with keys: calorieBurnt, suggestions. ${activityParser.getFormatInstructions()}`;
            try {
                const result = await llm.call([
                    ["system", "You are a fitness expert. Respond only in the required JSON format."],
                    ["user", prompt.replace('calorieBurnt', calories)],
                ]);
                const parsed = await activityParser.parse(result.content);
                return res.json(parsed);
            } catch (err) {
                return res.status(404).json({ error: 'not found, try refreshing' });
            }
        }

        // If not found locally, ask LLM for calories and suggestions
        const prompt = `How many calories does a ${user.currentWeightKg}kg person burn in ${minutes} minutes of ${activity}? Output strictly as JSON with keys: calorieBurnt, suggestions.`;
        try {
            const result = await llm.call([
                ["system", "You are a fitness expert. Respond only in the required JSON format."],
                ["user", prompt],
            ]);
            const parsed = await activityParser.parse(result.content);
            return res.json(parsed);
        } catch (err) {
            return res.status(404).json({ error: 'not found, try refreshing' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
