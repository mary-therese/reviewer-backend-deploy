import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/upload.js';
import featureRoutes from './routes/feature.js';
import distractorsRouter from "./routes/distractors.js";
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
app.use(
  cors({
    origin: (origin, callback) => {
      console.log('Incoming Origin:', origin);
      if (!origin) {
  
        return callback(null, true);
      }
      const allowedOrigins = [
        'http://localhost:5173', 
        'https://revio-web-ebon.vercel.app/', 
      ];
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn('Blocked Origin:', origin);
        callback(new Error('CORS not allowed for this origin'));
      }
    },
    credentials: true,
  })
);



app.use(express.json());

app.use((req, res, next) => {
  console.log("Incoming Origin:", req.headers.origin);
  next();
});


//Added part 09-23
// Quick health/root route (useful for Render + curl checks)
app.get('/', (req, res) => {
  res.send('Reviewer Backend is running');
});
app.get('/health', (req, res) => res.sendStatus(200));


// Routes
app.use('/upload', uploadRoutes);
app.use('/feature', featureRoutes);

// New route for term distractor
app.set("trust proxy", 1);
app.use("/api/distractors", distractorsRouter);

app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});


// Server Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Log errors on deploy issues fast
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at Promise', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});