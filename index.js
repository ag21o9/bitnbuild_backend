const express = require('express');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Import user and stats routes
const userRoutes = require('./src/users/user');
const statsRoutes = require('./src/users/stats');

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());


// Routes
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);

app.get('/', (req, res) => {
  res.send('FitSync Backend API is running!');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(port, () => {
  console.log(`FitSync Server is running on http://localhost:${port}`);
});
