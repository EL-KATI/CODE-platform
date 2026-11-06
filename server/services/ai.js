'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize clients lazily (only if API keys are set)
let anthropicClient = null;
let geminiClient = null;

function getAnthropicClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getGeminiClient() {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
}

const DRIVING_SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في تعليم قانون السير وقواعد المرور للمغرب.
مهمتك مساعدة الطلاب على فهم أسئلة الامتحان النظري لرخصة السياقة (الصنف B).
أجب بشكل واضح وموجز باللغة العربية أو الفرنسية حسب لغة السؤال.
ركز على:
- شرح قواعد الأولوية والإشارات
- توضيح حدود السرعة والمسافات
- تفسير الإشارات والعلامات الطرقية
- تقديم نصائح عملية لاجتياز الامتحان`;

async function askClaude(question, context = '') {
  const client = getAnthropicClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');

  const userContent = context
    ? `السياق: ${context}\n\nالسؤال: ${question}`
    : question;

  const response = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 1024,
    system: DRIVING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return {
    answer: textBlock?.text ?? '',
    model: 'claude',
    usage: response.usage,
  };
}

async function askGemini(question, context = '') {
  const googleAI = getGeminiClient();
  if (!googleAI) throw new Error('GEMINI_API_KEY not configured');

  const model = googleAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = context
    ? `${DRIVING_SYSTEM_PROMPT}\n\nالسياق: ${context}\n\nالسؤال: ${question}`
    : `${DRIVING_SYSTEM_PROMPT}\n\n${question}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;

  return {
    answer: response.text(),
    model: 'gemini',
    usage: null,
  };
}

// Auto-select: use Claude if available, fallback to Gemini
async function askAI(question, context = '', preferredModel = 'auto') {
  if (preferredModel === 'claude' || (preferredModel === 'auto' && process.env.ANTHROPIC_API_KEY)) {
    return askClaude(question, context);
  }
  if (preferredModel === 'gemini' || process.env.GEMINI_API_KEY) {
    return askGemini(question, context);
  }
  throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY');
}

function availableModels() {
  return {
    claude: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };
}

module.exports = { askClaude, askGemini, askAI, availableModels };
