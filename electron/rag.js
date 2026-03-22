const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');

let pipeline = null;
let extractor = null;

async function getExtractor() {
  if (!extractor) {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath);
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += xlsx.utils.sheet_to_csv(sheet) + '\n';
      });
      return text;
    } else if (['.txt', '.md', '.csv', '.json', '.js', '.ts', '.py', '.html', '.css'].includes(ext)) {
      return await fs.readFile(filePath, 'utf8');
    }
  } catch (err) {
    console.error(`Failed to extract text from ${filePath}:`, err);
  }
  return null;
}

function chunkText(text, maxTokens = 500) {
  // A simple chunking strategy by words
  const words = text.split(/\s+/);
  const chunks = [];
  let currentChunk = [];
  for (const word of words) {
    currentChunk.push(word);
    if (currentChunk.length >= maxTokens) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  return chunks;
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function ingestFile(filePath, dbPath) {
  const text = await extractText(filePath);
  if (!text || text.trim().length === 0) return 0;

  const chunks = chunkText(text);
  const extract = await getExtractor();
  
  let db = [];
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    db = JSON.parse(data);
  } catch (e) {}

  // Remove old chunks for this file
  db = db.filter(item => item.filePath !== filePath);

  let added = 0;
  for (const chunk of chunks) {
    if (chunk.trim().length < 10) continue;
    
    const output = await extract(chunk, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    
    db.push({
      id: uuidv4(),
      filePath,
      fileName: path.basename(filePath),
      text: chunk,
      embedding
    });
    added++;
  }

  await fs.writeFile(dbPath, JSON.stringify(db));
  return added;
}

async function searchMemory(query, dbPath, topK = 5) {
  let db = [];
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    db = JSON.parse(data);
  } catch (e) {
    return [];
  }

  if (db.length === 0) return [];

  const extract = await getExtractor();
  const output = await extract(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data);

  const results = db.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }));

  results.sort((a, b) => b.score - a.score);
  
  // Return top K results, omitting the large embedding arrays
  return results.slice(0, topK).map(r => ({
    id: r.id,
    filePath: r.filePath,
    fileName: r.fileName,
    text: r.text,
    score: r.score
  }));
}

module.exports = {
  ingestFile,
  searchMemory
};
