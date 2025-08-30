const express = require('express');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Health App Backend API is running!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
