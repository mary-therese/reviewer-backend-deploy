

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/upload.js';
import featureRoutes from './routes/feature.js';
import dotenv from 'dotenv';
dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// Ensure tmp folder exists
if (!fs.existsSync('./tmp')) {
  fs.mkdirSync('./tmp');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());



//Added part 09-23
// Quick health/root route (useful for Render + curl checks)
app.get('/', (req, res) => {
  res.send('Reviewer Backend is running');
});
app.get('/health', (req, res) => res.sendStatus(200));






// Routes
app.use('/upload', uploadRoutes);
app.use('/feature', featureRoutes);

app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});


// Server Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Log for unhandled errors to see build/deploy issues fast
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at Promise', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Not exiting here keeps Render from restarting repeatedly while debug.
});