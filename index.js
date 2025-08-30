const express = require('express');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

// A simple route to test the server
app.get('/', (req, res) => {
  res.send('Health App Backend API is running!');
});

// A route to get all users from the database
app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// A route to create a new user
app.post('/users', async (req, res) => {
  try {
    const { name, age, gender, weight, height, healthGoal, dietaryRestrictions } = req.body;
    const newUser = await prisma.user.create({
      data: {
        name,
        age,
        gender,
        weight,
        height,
        healthGoal,
        dietaryRestrictions,
      },
    });
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

// Get a specific user by ID with all related data
app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        healthData: true,
        mealPlans: true,
        chatbotInteractions: true,
        healthRecords: true,
        wearableData: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// Update a user
app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, age, gender, weight, height, healthGoal, dietaryRestrictions } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        age,
        gender,
        weight,
        height,
        healthGoal,
        dietaryRestrictions,
      },
    });
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// Delete a user
app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ===== HEALTH DATA ROUTES =====

// Get health data for a user
app.get('/users/:userId/health-data', async (req, res) => {
  try {
    const { userId } = req.params;
    const healthData = await prisma.healthData.findUnique({
      where: { userId },
      include: { user: true },
    });
    
    if (!healthData) {
      return res.status(404).json({ error: 'Health data not found.' });
    }
    
    res.json(healthData);
  } catch (error) {
    console.error('Error fetching health data:', error);
    res.status(500).json({ error: 'Failed to fetch health data.' });
  }
});

// Create or update health data for a user
app.post('/users/:userId/health-data', async (req, res) => {
  try {
    const { userId } = req.params;
    const { bmi, calorieNeeds } = req.body;
    
    const healthData = await prisma.healthData.upsert({
      where: { userId },
      update: { bmi, calorieNeeds },
      create: { userId, bmi, calorieNeeds },
    });
    
    res.status(201).json(healthData);
  } catch (error) {
    console.error('Error creating/updating health data:', error);
    res.status(500).json({ error: 'Failed to create/update health data.' });
  }
});

// ===== MEAL PLAN ROUTES =====

// Get all meal plans for a user
app.get('/users/:userId/meal-plans', async (req, res) => {
  try {
    const { userId } = req.params;
    const mealPlans = await prisma.mealPlan.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    res.json(mealPlans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    res.status(500).json({ error: 'Failed to fetch meal plans.' });
  }
});

// Create a new meal plan
app.post('/users/:userId/meal-plans', async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      date, 
      breakfast, 
      lunch, 
      dinner, 
      breakfastCalories, 
      lunchCalories, 
      dinnerCalories, 
      notes 
    } = req.body;
    
    const mealPlan = await prisma.mealPlan.create({
      data: {
        userId,
        date: date ? new Date(date) : new Date(),
        breakfast,
        lunch,
        dinner,
        breakfastCalories,
        lunchCalories,
        dinnerCalories,
        notes,
      },
    });
    
    res.status(201).json(mealPlan);
  } catch (error) {
    console.error('Error creating meal plan:', error);
    res.status(500).json({ error: 'Failed to create meal plan.' });
  }
});

// Get a specific meal plan
app.get('/meal-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id },
      include: { user: true },
    });
    
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found.' });
    }
    
    res.json(mealPlan);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    res.status(500).json({ error: 'Failed to fetch meal plan.' });
  }
});

// Update a meal plan
app.put('/meal-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      breakfast, 
      lunch, 
      dinner, 
      breakfastCalories, 
      lunchCalories, 
      dinnerCalories, 
      notes 
    } = req.body;
    
    const updatedMealPlan = await prisma.mealPlan.update({
      where: { id },
      data: {
        breakfast,
        lunch,
        dinner,
        breakfastCalories,
        lunchCalories,
        dinnerCalories,
        notes,
      },
    });
    
    res.json(updatedMealPlan);
  } catch (error) {
    console.error('Error updating meal plan:', error);
    res.status(500).json({ error: 'Failed to update meal plan.' });
  }
});

// Delete a meal plan
app.delete('/meal-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.mealPlan.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting meal plan:', error);
    res.status(500).json({ error: 'Failed to delete meal plan.' });
  }
});

// ===== CHATBOT INTERACTION ROUTES =====

// Get all chatbot interactions for a user
app.get('/users/:userId/chatbot-interactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const interactions = await prisma.chatbotInteraction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(interactions);
  } catch (error) {
    console.error('Error fetching chatbot interactions:', error);
    res.status(500).json({ error: 'Failed to fetch chatbot interactions.' });
  }
});

// Create a new chatbot interaction
app.post('/users/:userId/chatbot-interactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { question, answer } = req.body;
    
    const interaction = await prisma.chatbotInteraction.create({
      data: {
        userId,
        question,
        answer,
      },
    });
    
    res.status(201).json(interaction);
  } catch (error) {
    console.error('Error creating chatbot interaction:', error);
    res.status(500).json({ error: 'Failed to create chatbot interaction.' });
  }
});

// ===== HEALTH RECORD ROUTES =====

// Get all health records for a user
app.get('/users/:userId/health-records', async (req, res) => {
  try {
    const { userId } = req.params;
    const healthRecords = await prisma.healthRecord.findMany({
      where: { userId },
      orderBy: { visitDate: 'desc' },
    });
    res.json(healthRecords);
  } catch (error) {
    console.error('Error fetching health records:', error);
    res.status(500).json({ error: 'Failed to fetch health records.' });
  }
});

// Create a new health record
app.post('/users/:userId/health-records', async (req, res) => {
  try {
    const { userId } = req.params;
    const { weight, diagnosis, medications, allergies, procedures, notes, visitDate } = req.body;
    
    const healthRecord = await prisma.healthRecord.create({
      data: {
        userId,
        weight,
        diagnosis,
        medications,
        allergies,
        procedures,
        notes,
        visitDate: visitDate ? new Date(visitDate) : new Date(),
      },
    });
    
    res.status(201).json(healthRecord);
  } catch (error) {
    console.error('Error creating health record:', error);
    res.status(500).json({ error: 'Failed to create health record.' });
  }
});

// Get a specific health record
app.get('/health-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const healthRecord = await prisma.healthRecord.findUnique({
      where: { id },
      include: { user: true },
    });
    
    if (!healthRecord) {
      return res.status(404).json({ error: 'Health record not found.' });
    }
    
    res.json(healthRecord);
  } catch (error) {
    console.error('Error fetching health record:', error);
    res.status(500).json({ error: 'Failed to fetch health record.' });
  }
});

// Update a health record
app.put('/health-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight, diagnosis, medications, allergies, procedures, notes } = req.body;
    
    const updatedHealthRecord = await prisma.healthRecord.update({
      where: { id },
      data: {
        weight,
        diagnosis,
        medications,
        allergies,
        procedures,
        notes,
      },
    });
    
    res.json(updatedHealthRecord);
  } catch (error) {
    console.error('Error updating health record:', error);
    res.status(500).json({ error: 'Failed to update health record.' });
  }
});

// Delete a health record
app.delete('/health-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.healthRecord.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting health record:', error);
    res.status(500).json({ error: 'Failed to delete health record.' });
  }
});

// ===== WEARABLE DATA ROUTES =====

// Get all wearable data for a user
app.get('/users/:userId/wearable-data', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const wearableData = await prisma.wearableData.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });
    
    res.json(wearableData);
  } catch (error) {
    console.error('Error fetching wearable data:', error);
    res.status(500).json({ error: 'Failed to fetch wearable data.' });
  }
});

// Create new wearable data entry
app.post('/users/:userId/wearable-data', async (req, res) => {
  try {
    const { userId } = req.params;
    const { steps, heartRate, sleepHours, caloriesBurned } = req.body;
    
    const wearableData = await prisma.wearableData.create({
      data: {
        userId,
        steps,
        heartRate,
        sleepHours,
        caloriesBurned,
      },
    });
    
    res.status(201).json(wearableData);
  } catch (error) {
    console.error('Error creating wearable data:', error);
    res.status(500).json({ error: 'Failed to create wearable data.' });
  }
});

// Get latest wearable data for a user
app.get('/users/:userId/wearable-data/latest', async (req, res) => {
  try {
    const { userId } = req.params;
    const latestData = await prisma.wearableData.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!latestData) {
      return res.status(404).json({ error: 'No wearable data found.' });
    }
    
    res.json(latestData);
  } catch (error) {
    console.error('Error fetching latest wearable data:', error);
    res.status(500).json({ error: 'Failed to fetch latest wearable data.' });
  }
});

// Update wearable data entry
app.put('/wearable-data/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { steps, heartRate, sleepHours, caloriesBurned } = req.body;
    
    const updatedWearableData = await prisma.wearableData.update({
      where: { id },
      data: {
        steps,
        heartRate,
        sleepHours,
        caloriesBurned,
      },
    });
    
    res.json(updatedWearableData);
  } catch (error) {
    console.error('Error updating wearable data:', error);
    res.status(500).json({ error: 'Failed to update wearable data.' });
  }
});

// Delete wearable data entry
app.delete('/wearable-data/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.wearableData.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting wearable data:', error);
    res.status(500).json({ error: 'Failed to delete wearable data.' });
  }
});

// Connect to the database and start the server
async function main() {
  try {
    // Connect to the database
    await prisma.$connect();
    console.log('Successfully connected to the database.');

    // Start the Express server
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
}

main();
