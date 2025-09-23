import path from 'path';
import { postprocessMarkdown } from '../utils/postprocessMarkdown.js';
import { spawn } from 'child_process';


export const handlePdfUpload = async (req, res, next) => {
  const filePath = req.file.path;
  const py = spawn('python', ['python/extract_pdf.py', filePath]);

  let data = '';
  py.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  py.stderr.on('data', (err) => {
    console.error('Python error:', err.toString());
  });

 py.on('close', (code) => {
  try {
    const result = JSON.parse(data);
    if (result.success) {
      //This commented out is for debugging sa terminal, to show the raw text from file
      //console.log('[PDF] Raw Markdown:', result.markdown); //  Add this

      const cleaned = postprocessMarkdown(result.markdown, 'pdf');
      res._markdown = cleaned;
      next();
    }
 else {
        res.status(500).json({ error: result.error || 'Failed to extract PDF.' });
      }
    } catch (err) {
      console.error('JSON parse error:', err);
      res.status(500).json({ error: 'Invalid response from PDF extractor.' });
    }
  });
};


export const handlePptxUpload = async (req, res, next) => {
  const filePath = req.file.path;
  const py = spawn('python', ['python/extract_pptx.py', filePath]);

  let data = '';
  py.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  py.stderr.on('data', (err) => {
    console.error('Python error:', err.toString());
  });

py.on('close', (code) => {
  try {
    const result = JSON.parse(data);
    if (result.success) {
      //This commented out is for debugging sa terminal, to show the raw text from file
      //console.log('[PPTX] Raw Markdown:', result.markdown); //  Add this

      const cleaned = postprocessMarkdown(result.markdown, 'pptx');
      res._markdown = cleaned;
      next();
    }
 else {
        res.status(500).json({ error: result.error || 'Failed to extract PPTX.' });
      }
    } catch (err) {
      console.error('JSON parse error:', err);
      res.status(500).json({ error: 'Invalid response from PPTX extractor.' });
    }
  });
};



export const handleDocxUpload = async (req, res, next) => {
  const filePath = req.file.path;
  const pandoc = spawn('pandoc', ['-f', 'docx', '-t', 'markdown', filePath]);

  let markdown = '';
  let error = '';

  pandoc.stdout.on('data', (data) => {
    markdown += data.toString();
  });

  pandoc.stderr.on('data', (err) => {
    error += err.toString();
  });

  pandoc.on('close', (code) => {
  if (code === 0) {
    //This commented out is for debugging sa terminal, to show the raw text from file
    //console.log('[DOCX] Raw Markdown:', markdown); //  Add this

    const cleaned = postprocessMarkdown(markdown, 'docx');
    res._markdown = cleaned;
    next();
// pass control to feature controller
    } else {
      res.status(500).json({
        error: error || 'Failed to convert DOCX to Markdown.'
      });
    }
  });
};





