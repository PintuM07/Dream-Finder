const { GoogleGenAI } = require('@google/genai');

let ai = null;

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

// Only include models that are confirmed working for this API key
const MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.6-flash'];

async function generateWithGroq(prompt) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey === 'your_groq_api_key_here') {
    throw new Error('GROQ_API_KEY is not configured in .env');
  }

  const groqModels = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
  let lastGroqErr;

  for (const model of groqModels) {
    try {
      console.log(`[Groq AI] Attempting fallback with model: ${model}`);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Groq API returned ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        console.log(`[Groq AI] Successfully generated response using ${model}`);
        return data.choices[0].message.content;
      }
    } catch (err) {
      console.warn(`[Groq AI] Failed model ${model}:`, err.message);
      lastGroqErr = err;
    }
  }

  throw lastGroqErr || new Error('Groq AI fallback failed');
}

async function generate(prompt, retries = 3) {
  let lastError;

  // Try Gemini models first
  try {
    const client = getClient();
    for (const model of MODELS) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await client.models.generateContent({ model, contents: prompt });
          return response.text;
        } catch (err) {
          lastError = err;
          const msg = err.message || '';
          // If model not found, try next model immediately
          if (msg.includes('404') || msg.includes('not found') || msg.includes('not available')) {
            break;
          }
          // If 503 high demand, wait and retry same model
          if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
            const wait = attempt * 2000;
            console.log(`[Gemini] Model ${model} busy (attempt ${attempt}/${retries}), retrying in ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          // Other errors — try next model
          break;
        }
      }
    }
  } catch (geminiInitErr) {
    lastError = geminiInitErr;
    console.warn('[Gemini AI] Initialization/Client error:', geminiInitErr.message);
  }

  // If Gemini failed or key not configured/limit hit, fallback to Groq
  console.warn('[Gemini AI] Gemini limit reached or unavailable. Falling back to Groq AI...');
  try {
    return await generateWithGroq(prompt);
  } catch (groqErr) {
    console.error('[Groq AI Fallback Error]', groqErr.message);
    throw lastError || groqErr;
  }
}

async function matchJobToProfile(job, profile) {
  const prompt = `
You are an expert job matching AI. Analyze the fit between this candidate profile and job listing.

CANDIDATE PROFILE:
Name: ${profile.name}
Current Title: ${profile.currentTitle || 'Not specified'}
Years of Experience: ${profile.yearsOfExperience || 'Not specified'}
Skills: ${(profile.skills || []).join(', ')}
Education: ${profile.education || 'Not specified'}
Summary: ${profile.summary || 'Not specified'}
Preferred Locations: ${(profile.preferredLocations || []).join(', ')}
Job Type Preference: ${profile.jobType || 'Any'}

JOB LISTING:
Title: ${job.job_title}
Company: ${job.employer_name}
Location: ${job.job_city || 'Remote'}, ${job.job_country || ''}
Job Type: ${job.job_employment_type || 'Not specified'}
Description: ${(job.job_description || '').substring(0, 1500)}

Respond with a JSON object (no markdown, just raw JSON) with these exact fields:
{
  "matchScore": <number 0-100>,
  "matchLevel": "<Excellent|Good|Fair|Poor>",
  "matchingSkills": [<list of skills that match>],
  "missingSkills": [<list of required skills candidate lacks>],
  "strengths": [<2-3 key strengths for this role>],
  "concerns": [<1-2 potential concerns or gaps>],
  "recommendation": "<1-2 sentence recommendation on whether to apply>"
}
`;

  const text = await generate(prompt);
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function generateCoverLetter(job, profile) {
  const prompt = `
Write a professional, compelling cover letter for the following job application.

CANDIDATE:
Name: ${profile.name}
Current Title: ${profile.currentTitle || 'Professional'}
Years of Experience: ${profile.yearsOfExperience || ''} years
Key Skills: ${(profile.skills || []).slice(0, 8).join(', ')}
Education: ${profile.education || ''}
Summary: ${profile.summary || ''}

JOB:
Title: ${job.job_title}
Company: ${job.employer_name}
Location: ${job.job_city || 'Remote'}
Description: ${(job.job_description || '').substring(0, 1000)}

Write a 3-paragraph cover letter that:
1. Opens with enthusiasm and mentions the specific role and company
2. Highlights 2-3 most relevant experiences/skills that match the job
3. Closes with a call to action

Keep it professional, specific, and under 300 words. Do NOT use placeholder text — use the actual candidate information.
`;

  return await generate(prompt);
}

async function parseResumeText(resumeText) {
  const prompt = `
Parse the following resume text and extract structured information.

RESUME:
${resumeText.substring(0, 3000)}

Respond with a JSON object (no markdown, just raw JSON):
{
  "name": "<full name>",
  "currentTitle": "<current or most recent job title>",
  "yearsOfExperience": <estimated years as a number>,
  "skills": [<list of technical and soft skills>],
  "education": "<highest degree and institution>",
  "summary": "<2-3 sentence professional summary>",
  "suggestedJobTitles": [<3-5 job titles they would be a good fit for>]
}
`;

  const text = await generate(prompt);
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function generateInterviewQuestions(job, profile) {
  const prompt = `
Generate 8 likely interview questions for this candidate applying to this job.

CANDIDATE SKILLS: ${(profile.skills || []).join(', ')}
JOB TITLE: ${job.job_title}
COMPANY: ${job.employer_name}
JOB DESCRIPTION: ${(job.job_description || '').substring(0, 800)}

Include a mix of:
- 3 technical/skill-based questions
- 2 behavioral questions (STAR format)
- 2 company/role specific questions
- 1 tough question they should prepare for

Respond with JSON array (no markdown):
[
  { "question": "<question>", "type": "<Technical|Behavioral|Role-Specific|Tough>", "tip": "<brief tip on how to answer>" }
]
`;

  const text = await generate(prompt);
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function searchJobsWithAI({ query, location, remoteOnly, employmentType, profile }) {
  const profileContext = profile?.setup ? `
Candidate Profile:
- Name: ${profile.name}
- Title: ${profile.currentTitle || 'Software Developer'}
- Skills: ${(profile.skills || []).join(', ')}
- Experience: ${profile.yearsOfExperience || 2} years
- Preferred Locations: ${(profile.preferredLocations || []).join(', ') || location || 'India'}
` : '';

  const prompt = `You are a job board AI. Generate exactly 8 realistic, detailed job listings for the following search.

Search Query: "${query || 'software developer'}"
Location: ${location || 'India'}
Remote Only: ${remoteOnly ? 'Yes' : 'No'}
${profileContext}

Generate 8 job listings that would realistically appear on Naukri, LinkedIn, or Indeed India. Include real Indian companies (like TCS, Infosys, Wipro, HCL, Razorpay, PhonePe, Zomato, Flipkart, Amazon India, Microsoft India, Google India, Swiggy, Paytm, CRED, MakeMyTrip, etc.) and also some startups.

Respond ONLY with a raw JSON array (no markdown, no explanation):
[
  {
    "job_id": "ai_1",
    "job_title": "...",
    "employer_name": "...",
    "employer_logo": null,
    "job_city": "...",
    "job_state": "...",
    "job_country": "IN",
    "job_employment_type": "FULLTIME",
    "job_is_remote": false,
    "job_description": "...(detailed 150-word description with requirements, responsibilities, skills needed, and CTC range in LPA)...",
    "job_apply_link": "https://...",
    "job_posted_at_datetime_utc": "${new Date().toISOString()}",
    "job_min_salary": 1200000,
    "job_max_salary": 2000000,
    "job_salary_period": "YEAR"
  }
]

Rules:
- Mix of remote and on-site jobs
- Realistic CTC ranges in Indian Rupees (e.g. 800000 to 5000000)
- job_description must be 100-200 words with tech stack, responsibilities, and requirements
- job_apply_link should be the company's actual careers page URL
- Vary the seniority: junior, mid, senior roles
- All must match the search query "${query}"`;

  const text = await generate(prompt);
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jobs = JSON.parse(cleaned);

  // Ensure unique job IDs
  return jobs.map((job, i) => ({
    ...job,
    job_id: `ai_${Date.now()}_${i}`,
  }));
}

module.exports = { matchJobToProfile, generateCoverLetter, parseResumeText, generateInterviewQuestions, searchJobsWithAI };
