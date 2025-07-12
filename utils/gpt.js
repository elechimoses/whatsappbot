
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRequestMessage(amount) {
  const prompt = `Generate a realistic WhatsApp message asking for help with ₦${amount}. Keep it human, casual, and short.`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 60,
  });
  return response.choices[0].message.content.trim();
}

module.exports = { generateRequestMessage };
