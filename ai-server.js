'use strict';

const express = require('express');

const app = express();
const PORT = 3001;
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const MODEL = 'gemma3:1b';

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SYSTEM_PROMPT = `
You are JALLAD AI inside SOCIAL CHAT.

IDENTITY:
Your name is JALLAD AI. Never call yourself JLD AI, JLD AI, ChatGPT,
Gemini, or any other name.

LANGUAGE:
Always reply in the same language and writing style as the latest user
message. Roman Urdu means Roman Urdu. Urdu script means Urdu script.
English means English. Match mixed-language messages naturally.
Never switch to English unnecessarily.

STYLE:
Be friendly, natural, direct, concise and helpful.
Do not translate or explain the user's message unless asked.
Avoid unnecessary introductions and repeated phrases.
Never request passwords, private login codes, or secret API keys.
Keep all answers age-appropriate.
`;

function asksForName(text) {
  return /(?:what(?:'s| is) your name|your name|who are you|what are you called|tera naam kya|tumhara naam kya|aapka naam kya|apka naam kya|naam kya hai|tum kon ho|tum kaun ho|kon ho tum|kaun ho tum|apna naam bata|sirf apna naam)/i.test(text);
}

function asksInEnglish(text) {
  return /(?:what(?:'s| is) your name|your name|who are you|what are you called)/i.test(text);
}

app.get('/api/health', async (req, res) => {
  try {
    const response = await fetch(
      'http://127.0.0.1:11434/api/tags',
      { signal: AbortSignal.timeout(5000) }
    );

    const data = await response.json();

    res.json({
      ok: response.ok,
      provider: 'Local Ollama',
      model: MODEL,
      modelAvailable: (data.models || []).some(
        item => item.name === MODEL || item.name.startsWith(MODEL + ':')
      )
    });
  } catch {
    res.status(503).json({
      ok: false,
      provider: 'Local Ollama',
      error: 'Ollama is not running.'
    });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const input = req.body?.messages;

  if (!Array.isArray(input) || input.length === 0 || input.length > 12) {
    return res.status(400).json({
      error: 'Send between 1 and 12 messages.'
    });
  }

  for (const item of input) {
    if (
      !item ||
      !['user', 'assistant'].includes(item.role) ||
      typeof item.content !== 'string' ||
      !item.content.trim() ||
      item.content.length > 4000
    ) {
      return res.status(400).json({
        error: 'Invalid message. Each message must be under 4000 characters.'
      });
    }
  }

  const latest = input[input.length - 1];

  if (latest.role !== 'user') {
    return res.status(400).json({
      error: 'The last message must be from the user.'
    });
  }

  // Reply instantly and consistently when the user asks the AI's name.
  if (asksForName(latest.content)) {
    return res.json({
      reply: asksInEnglish(latest.content)
        ? 'My name is JALLAD AI.'
        : 'Mera naam JALLAD AI hai.',
      model: MODEL
    });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...input.map(item => ({
      role: item.role,
      content: item.content.trim()
    }))
  ];

  try {
    const upstream = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        keep_alive: '10m',
        options: {
          temperature: 0.5,
          num_predict: 180
        }
      }),
      signal: AbortSignal.timeout(120000)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error('Ollama error:', upstream.status, data);
      return res.status(502).json({
        error: data.error || 'JALLAD AI could not generate a reply.'
      });
    }

    const reply = data.message?.content;

    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({
        error: 'AI returned an empty reply.'
      });
    }

    return res.json({
      reply: reply.trim(),
      model: MODEL
    });
  } catch (error) {
    console.error('Ollama connection error:', error.message);

    return res.status(503).json({
      error: 'Cannot connect to Ollama. Make sure it is running.'
    });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`JALLAD AI backend running at http://127.0.0.1:${PORT}`);
});