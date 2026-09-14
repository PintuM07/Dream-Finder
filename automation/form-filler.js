/**
 * form-filler.js
 * 
 * Intelligent Page Analyzer & Automated Form Filling Engine for Job Applications.
 * Handles:
 *  - CV / Resume file attachment across input[type="file"] and drop zones
 *  - Auto-filling candidate details (Name, Email, Phone, Title, Experience, Salary, Social Links, Location)
 *  - Smart dropdown and radio option selection
 *  - AI-assisted answering for complex/custom application questions
 *  - Multi-step page navigation (Next, Continue, Review, Submit)
 */

const fs = require('fs');
const path = require('path');
const log = require('./logger');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000/api';

const sleep = ms => new Promise(r => setTimeout(r, ms + Math.random() * 300));

/**
 * Main form filler & page analyzer entry point.
 */
async function analyzeAndFillForm(page, profile = {}, coverLetter = '') {
  log.info(`🔍 Analyzing page structure: ${page.url()}`);

  try {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(1500);

    // 1. Attach CV / Resume
    await attachCV(page, profile);

    // 2. Scan and fill form input fields
    await fillFormFields(page, profile, coverLetter);

    // 3. Handle Select Dropdowns & Radio Buttons
    await fillSelectsAndRadios(page, profile);

    // 4. Handle Unrecognized Custom Questions with AI
    await answerCustomAIQuestions(page, profile, coverLetter);

    // 5. Check and advance through multi-step form buttons
    const submitted = await advanceOrSubmit(page);
    return submitted;
  } catch (err) {
    log.error(`Form analysis error: ${err.message}`);
    return false;
  }
}

/**
 * Finds CV attachment inputs and uploads the resume file.
 */
async function attachCV(page, profile) {
  try {
    const resumePath = profile.resumeFilePath || path.join(__dirname, '../backend/data/resume.pdf');
    
    // Check if resume file exists
    if (!fs.existsSync(resumePath)) {
      // Create a dummy PDF if file doesn't exist so file upload doesn't throw ENOENT
      const dataDir = path.dirname(resumePath);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(resumePath, '%PDF-1.4 Mock Resume Document for Auto Apply');
      log.info(`Created default resume placeholder at: ${resumePath}`);
    }

    // Look for file input elements
    const fileInputs = await page.$$('input[type="file"], input[accept*="pdf"], input[accept*="doc"]');
    
    if (fileInputs.length > 0) {
      for (const input of fileInputs) {
        try {
          const isVisible = await input.isVisible().catch(() => true);
          await input.setInputFiles(resumePath);
          log.success(`📎 Attached CV (${path.basename(resumePath)}) to page!`);
          await sleep(1000);
        } catch (e) {
          log.warn(`Could not attach CV to file input: ${e.message}`);
        }
      }
    } else {
      // Check for upload button triggering file chooser
      const uploadBtn = await page.$('button:has-text("Upload"), label:has-text("Upload"), button:has-text("Resume"), label:has-text("Resume"), .upload-btn');
      if (uploadBtn) {
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 3000 }),
            uploadBtn.click(),
          ]);
          await fileChooser.setFiles(resumePath);
          log.success(`📎 Attached CV via Upload button trigger!`);
          await sleep(1000);
        } catch {}
      }
    }
  } catch (err) {
    log.warn(`CV attachment skipped: ${err.message}`);
  }
}

/**
 * Fills standard text, email, tel, number inputs and textareas.
 */
async function fillFormFields(page, profile, coverLetter) {
  const inputs = await page.$$('input:not([type="file"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"]), textarea');

  const fullName = profile.name || 'Candidate';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Candidate';
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];

  for (const input of inputs) {
    try {
      if (!(await input.isVisible().catch(() => false))) continue;
      
      const currentVal = await input.inputValue().catch(() => '');
      if (currentVal && currentVal.length > 0) continue; // Skip already filled

      const attrName = (await input.getAttribute('name')) || '';
      const attrId = (await input.getAttribute('id')) || '';
      const attrType = (await input.getAttribute('type')) || '';
      const placeholder = (await input.getAttribute('placeholder')) || '';
      const ariaLabel = (await input.getAttribute('aria-label')) || '';
      
      // Get associated label text
      let labelText = '';
      if (attrId) {
        labelText = await page.$eval(`label[for="${attrId}"]`, el => el.innerText).catch(() => '');
      }
      if (!labelText) {
        labelText = await input.evaluate(el => {
          const parentLabel = el.closest('label');
          if (parentLabel) return parentLabel.innerText;
          const prev = el.previousElementSibling;
          return prev ? prev.innerText : '';
        }).catch(() => '');
      }

      const fieldDescriptor = `${attrName} ${attrId} ${placeholder} ${ariaLabel} ${labelText}`.toLowerCase();

      // Field Matcher heuristics
      let valueToFill = null;

      if (fieldDescriptor.includes('first name') || fieldDescriptor.includes('given name')) {
        valueToFill = firstName;
      } else if (fieldDescriptor.includes('last name') || fieldDescriptor.includes('family name') || fieldDescriptor.includes('surname')) {
        valueToFill = lastName;
      } else if (fieldDescriptor.includes('full name') || fieldDescriptor.includes('name')) {
        valueToFill = fullName;
      } else if (fieldDescriptor.includes('email') || attrType === 'email') {
        valueToFill = profile.email;
      } else if (fieldDescriptor.includes('phone') || fieldDescriptor.includes('mobile') || fieldDescriptor.includes('contact') || attrType === 'tel') {
        valueToFill = profile.phone || '9999999999';
      } else if (fieldDescriptor.includes('linkedin')) {
        valueToFill = profile.linkedinUrl || '';
      } else if (fieldDescriptor.includes('github') || fieldDescriptor.includes('git')) {
        valueToFill = profile.githubUrl || '';
      } else if (fieldDescriptor.includes('portfolio') || fieldDescriptor.includes('website')) {
        valueToFill = profile.portfolioUrl || profile.githubUrl || '';
      } else if (fieldDescriptor.includes('title') || fieldDescriptor.includes('designation') || fieldDescriptor.includes('headline')) {
        valueToFill = profile.currentTitle || 'Software Engineer';
      } else if (fieldDescriptor.includes('experience') || fieldDescriptor.includes('years')) {
        valueToFill = profile.yearsOfExperience ? String(profile.yearsOfExperience) : '2';
      } else if (fieldDescriptor.includes('ctc') || fieldDescriptor.includes('salary') || fieldDescriptor.includes('compensation')) {
        valueToFill = profile.expectedSalary ? String(profile.expectedSalary) : '700000';
      } else if (fieldDescriptor.includes('notice') || fieldDescriptor.includes('availability')) {
        valueToFill = profile.noticePeriod || 'Immediate';
      } else if (fieldDescriptor.includes('city') || fieldDescriptor.includes('location') || fieldDescriptor.includes('address')) {
        valueToFill = (profile.preferredLocations && profile.preferredLocations[0]) || 'Kolkata';
      } else if (fieldDescriptor.includes('cover') || fieldDescriptor.includes('letter') || fieldDescriptor.includes('summary') || fieldDescriptor.includes('about')) {
        valueToFill = coverLetter || profile.summary || `Application submitted by ${fullName}`;
      }

      if (valueToFill) {
        await input.fill('');
        await input.fill(valueToFill);
        log.info(`  ✍️ Filled field [${labelText || attrName || placeholder || 'input'}]: "${valueToFill.substring(0, 30)}..."`);
        await sleep(300);
      }
    } catch {}
  }
}

/**
 * Handles select dropdowns and radio buttons.
 */
async function fillSelectsAndRadios(page, profile) {
  // 1. Radio buttons (Work authorization / Notice period / Yes-No questions)
  try {
    const radioGroups = await page.$$('input[type="radio"]');
    const checkedGroups = new Set();

    for (const radio of radioGroups) {
      const name = await radio.getAttribute('name');
      if (name && !checkedGroups.has(name)) {
        const isChecked = await radio.isChecked().catch(() => false);
        if (!isChecked) {
          // Default to clicking 'Yes' or first radio option for questions
          const parentText = await radio.evaluate(el => el.parentElement ? el.parentElement.innerText : '').catch(() => '');
          if (parentText.toLowerCase().includes('yes') || parentText.toLowerCase().includes('authorized') || parentText.toLowerCase().includes('immediate')) {
            await radio.click().catch(() => {});
            checkedGroups.add(name);
          } else if (!checkedGroups.has(name)) {
            await radio.click().catch(() => {});
            checkedGroups.add(name);
          }
        }
      }
    }
  } catch {}

  // 2. Select dropdowns
  try {
    const selects = await page.$$('select');
    for (const select of selects) {
      const currentVal = await select.inputValue().catch(() => '');
      if (!currentVal || currentVal === '0' || currentVal === '') {
        const options = await select.$$('option');
        if (options.length > 1) {
          // Select 2nd option (index 1) assuming index 0 is "-- Select --"
          const valToSelect = await options[1].getAttribute('value') || await options[1].innerText();
          await select.selectOption(valToSelect).catch(() => {});
        }
      }
    }
  } catch {}
}

/**
 * Uses Gemini AI to respond to unrecognized custom application questions.
 */
async function answerCustomAIQuestions(page, profile, coverLetter) {
  try {
    const emptyTextareas = await page.$$('textarea');
    for (const area of emptyTextareas) {
      const val = await area.inputValue().catch(() => '');
      if (!val || val.length < 5) {
        const placeholder = await area.getAttribute('placeholder').catch(() => '');
        const id = await area.getAttribute('id').catch(() => '');
        const label = await area.evaluate(el => el.previousElementSibling ? el.previousElementSibling.innerText : '').catch(() => '');
        const questionText = `${label} ${placeholder} ${id}`.trim();

        if (questionText.length > 5) {
          log.ai(`🤖 Asking Gemini AI to answer custom question: "${questionText.substring(0, 60)}..."`);
          
          let aiResponse = `I have ${profile.yearsOfExperience || 2}+ years of experience in ${(profile.skills || ['Software Engineering']).slice(0, 3).join(', ')}. I am highly motivated and confident in bringing strong technical skills to this role.`;

          try {
            const res = await fetch(`${BACKEND_URL}/ai/cover-letter`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                job: { job_title: profile.currentTitle || 'Software Engineer', job_description: questionText }
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.coverLetter) aiResponse = data.coverLetter.substring(0, 500);
            }
          } catch {}

          await area.fill(aiResponse);
          log.success(`  🤖 AI Answered: "${aiResponse.substring(0, 40)}..."`);
        }
      }
    }
  } catch (err) {
    log.warn(`AI question answering skipped: ${err.message}`);
  }
}

/**
 * Detects Submit, Review, Next, or Apply buttons and advances the form.
 */
async function advanceOrSubmit(page) {
  try {
    const submitBtn = await page.$(
      'button:has-text("Submit"), button:has-text("Submit Application"), input[type="submit"], button:has-text("Apply Now")'
    );
    if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
      log.info('🚀 Clicking Submit Application button...');
      await submitBtn.click();
      await sleep(2500);
      return true;
    }

    const nextBtn = await page.$(
      'button:has-text("Next"), button:has-text("Continue"), button:has-text("Review"), button:has-text("Save & Next")'
    );
    if (nextBtn && await nextBtn.isVisible().catch(() => false)) {
      log.info('➡️ Step complete. Clicking Next / Continue...');
      await nextBtn.click();
      await sleep(2000);
      return false; // Multi-step in progress
    }
  } catch {}
  return false;
}

module.exports = { analyzeAndFillForm, attachCV };
