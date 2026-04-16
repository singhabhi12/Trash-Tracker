const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');

const PROMPT = `You are an expert at reading waste collection calendars (Abfuhrkalender / Müllkalender).

Analyze the content and extract EVERY waste collection pickup date.

Return ONLY valid JSON in this exact format:
{
  "dates": [
    { "date": "YYYY-MM-DD", "type": "restmuell" }
  ]
}

Waste type mapping — map any language to ONE of these 4 exact values:
- "restmuell"  → grey/black bin, general/residual/household waste (Restmüll, Restabfall, Hausmüll)
- "bio"        → brown bin, organic/food/garden waste (Biomüll, Biotonne, Bioabfall, organic)
- "gelb"       → yellow bag or yellow bin, plastic/packaging (Gelbe Tonne, Gelber Sack, LVP, Leichtverpackungen)
- "papier"     → blue bin, paper/cardboard (Papiertonne, Altpapier, Papier/Pappe)

Rules:
- Include ALL dates — do not omit any
- If multiple types are collected on the same day, create one entry per type
- All dates must be in YYYY-MM-DD format
- If the year is unclear, assume the nearest upcoming year
- Ignore exception notes or holidays listed as "no collection"`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, content } = req.body || {};
  if (!type || !content) return res.status(400).json({ error: 'Missing type or content' });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    let messages;

    if (type === 'image') {
      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: content, detail: 'high' } },
          { type: 'text', text: PROMPT }
        ]
      }];
    } else if (type === 'pdf') {
      let text;
      try {
        const base64Data = content.replace(/^data:[^;]+;base64,/, '');
        const buf = Buffer.from(base64Data, 'base64');
        const parsed = await pdfParse(buf);
        text = parsed.text;
      } catch {
        return res.status(422).json({
          error: 'Could not read this PDF. If it is a scanned image, please take a photo and upload that instead.'
        });
      }
      if (!text || text.trim().length < 40) {
        return res.status(422).json({
          error: 'This PDF appears to be a scanned image. Please take a photo of the calendar and upload that instead.'
        });
      }
      messages = [{
        role: 'user',
        content: `${PROMPT}\n\nCalendar text (extracted from PDF):\n\n${text.slice(0, 15000)}`
      }];
    } else {
      messages = [{
        role: 'user',
        content: `${PROMPT}\n\nCalendar text:\n\n${content.slice(0, 15000)}`
      }];
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    const validTypes = new Set(['restmuell', 'bio', 'gelb', 'papier']);
    const dates = (raw.dates || []).filter(d =>
      typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
      typeof d.type === 'string' && validTypes.has(d.type)
    );

    return res.status(200).json({ dates });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ error: 'AI processing failed. Please try again.' });
  }
};
