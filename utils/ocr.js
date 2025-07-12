const Tesseract = require('tesseract.js');
const fs = require('fs');

async function extractTextFromImage(imagePath) {
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
  return text;
}

function verifyReceiptText(text, expectedAmount, expectedAccount) {
  const amountMatch = text.includes(expectedAmount.toString());
  const accountMatch = text.includes(expectedAccount);
  return amountMatch && accountMatch;
}

module.exports = { extractTextFromImage, verifyReceiptText };
