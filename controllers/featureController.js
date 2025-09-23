import { db } from '../utils/firebaseAdmin.js';
import { simulateRes } from '../utils/simulateRes.js';
import { postprocessMarkdown } from '../utils/postprocessMarkdown.js';
import { generateWithGPT } from '../utils/generateWithGPT.js';

// -------------------------
// Counter Meta on Firestore - ID Gen
// ---------------------
const updateCounterAndGetId = async (uid, folderId, prefix) => {
  const metaRef = db.collection('users').doc(uid).collection('meta').doc('counters');
  await db.runTransaction(async (transaction) => {
    const metaDoc = await transaction.get(metaRef);
    if (!metaDoc.exists) {
      transaction.set(metaRef, {
        acronymCounter: 0,
        termCounter: 0,
        summarizationCounter: 0,
        aiCounter: 0
      });
    }
  });

  const counterField = {
    AcronymMnemonics: 'acronymCounter',
    TermsAndCondition: 'termCounter',
    SummarizedReviewers: 'summarizationCounter',
    SummarizedAIReviewers: 'aiCounter'
  }[folderId];

  const counterRef = db.collection('users').doc(uid).collection('meta').doc('counters');
  const counterSnapshot = await counterRef.get();
  const current = counterSnapshot.data()?.[counterField] || 0;
  const next = current + 1;
  await counterRef.update({ [counterField]: next });
  return `${prefix}${next}`;
};




// -------------------------
// Helper: remove ```json or ``` fences from GPT output
// -------------------------
function stripFenced(text) {
  if (!text) return '';
  return text.replace(/```json\s*/gi, '')  // remove opening ```json
             .replace(/```/g, '')         // remove closing ```
             .trim();
}


//-------------------------
// Feature Processor / Prompting
// ---------------------
async function processFeature(req, res, featureType) {
  try {
    const uid = req.user.uid;

    let folderId, prefix, systemPrompt, temperature = 0;

    switch (featureType) {
      case 'acronym':
        folderId = 'AcronymMnemonics';
        prefix = 'ac';
        break;

      case 'terms':
        folderId = 'TermsAndCondition';
        prefix = 'td';
        break;

      case 'summarize':
        folderId = 'SummarizedReviewers';
        prefix = 'std';
        systemPrompt = `

You are an academic assistant helping students prepare for exams.

Task:
- Read the provided study material.
- Summarize it into a structured study guide using the exact format below.
- Do not omit or paraphrase away important concepts.
- Do not add new explanations or interpretations.
- Preserve technical terms, definitions, and core information exactly as they appear.
- The goal is a compressed but faithful summary that students can review quickly.

Output format (strict JSON only):

{
  "title": "<Overall title of the content>",
  "sections": [
    {
      "title": "<Section title>",
      "summary": "<Concise factual summary of this section, preserving all original concepts>",
      "concepts": [
        {
          "term": "<Key term or phrase from the content>",
          "explanation": "<Exact or minimally rephrased explanation from the text>",
          "example": "<Example only if explicitly provided in the text>"
        }
      ],
      "keyTakeaways": [
        "<Important fact or point preserved verbatim or near-verbatim>",
        "<Another important fact>",
        "..."
      ]
    }
  ]
}
             
        `;
        break;

      case 'explain':
        folderId = 'SummarizedAIReviewers';
        prefix = 'ai';
        systemPrompt = `    
You are an academic tutor explaining study material to a Grade 10 student.

Task:
- Read the provided study material.
- Extract all important concepts, definitions, terms, steps, and examples — do not omit details.
- Present the material in a way that is accurate and faithful (preserves technical content) while also being clear and approachable for a Grade 10 student.
- Provide both:
      - Concise factual summary of each section (preservation).
      - Plain-language explanation + analogy (translation for easier learning)
- Do not invent new technical content. Only use what is given.
- The goal is a complete, student-friendly study guide that is both reliable and easy to review

Output format (strict JSON only):

{
  "title": "<Overall title of the content>",
  "sections": [
    {
      "title": "<Section title>",
      "explanation": "<Clear, plain-language explanation of the section>",
      "analogy": "<Analogy or comparison to help students understand>",
      "steps": [
        "<Step 1 in a process, if applicable>",
        "<Step 2>",
        "<Step 3>",
        ...
      ],
      "keyPoints": [
        "<Simple takeaway for this section>",
        "<Another simple takeaway>",
        ...
      ]
    },
    ...
  ]
}     
        `;
        break;
    }

    // Get reviewer ID
    const reviewerId = await updateCounterAndGetId(uid, folderId, prefix);

    //extract markdown
    let markdown = req.body.markdown || '';
    if (!markdown && req.file) markdown = await simulateRes(req.file.path, req.file.mimetype);

    if (!markdown) {
      return res.status(400).json({ error: 'No content to process' });
    }

    // Postprocess onli for summarize/explain
    if (['summarize', 'explain'].includes(featureType)) {
      markdown = postprocessMarkdown(markdown, req.file?.mimetype || req.body.sourceType);
    }

    // Debugging for viewing the processed markdown on postman. Use any feature endpoint.
    if (process.env.RETURN_MARKDOWN_ONLY === "true") {
      return res.json({ processedMarkdown: markdown });
    }

    let parsed;

    // --------------------------
    // Two-step flow for Acronym // Updated now four steps 0-3 (09/22)
    // ----------------------
if (featureType === 'acronym') {
  // Step 0: GPT-based markdown cleaning/restructuring
  const step0SystemPrompt = `
You are an expert Markdown formatting assistant.

Task:
- Take the raw text provided below.
- Clean and structure it into Markdown **with strict rules**:

Formatting Rules:
1. Each group of terms must have a group title starting with '## '.
2. Terms under a group must be a bullet list using '- '.
3. Explanations, definitions, or extra descriptive text should remain as plain paragraphs under the group title, **not in the bullets**.
4. Keep the order of terms as in the original text.
5. Do not merge, paraphrase, or remove terms.
6. Remove any extra numbering, messy line breaks, or unrelated content.
7. Maintain proper spacing: a blank line between the group title, explanation, and bullets.
8. Do not add new content or explanations. Only clean and reformat what exists.

Additional Instructions:
- A term is any short phrase or noun that represents a key concept or item. Explanations or definitions are full sentences or paragraphs and should not be converted into bullets.
- Replace any messy symbols such as •, *, or numbered lists with standard '- ' bullets.
- Ensure the first letter of each bullet is capitalized.
- Even if a group has no explanation, leave a blank line after the group title.

Example
Messy Raw Input (literal extraction):
"Integration models Integration models define how applications will be integrated by specifying mechanisms
Presentation Integration typically used to create a new UI
• Data Integration managed and stored for reusing or synchronizing data

Security models Authentication verifies user identity
Authorization Grants access based on permissions"

Notes on messiness:
- No proper headings for groups.
- Terms not consistently bulleted or numbered.
- Explanations are mixed with terms.
- Some bullets use weird symbols (•).
- Line breaks inconsistent.

Expected GPT Output (strict, predictable markdown):
"## Integration models

Integration models define how applications will be integrated by specifying mechanisms.

- Presentation Integration: Typically used to create a new UI
- Data Integration: Managed and stored for reusing or synchronizing data

## Security models

- Authentication: Verifies user identity
- Authorization: Grants access based on permissions"

What changed:
- ## added for group titles.
- Explanatory sentence preserved as paragraph.
- All terms normalized to - bullets.
- Weird symbols removed, capitalization standardized.
- Order preserved.

`;

  const step0UserPrompt = `Content to process:\n---\n${markdown}\n---`;

  const step0Output = await generateWithGPT({
    userPrompt: step0UserPrompt,
    systemPrompt: step0SystemPrompt,
    temperature: 0
  });

  console.log("[acronym Step0] Raw GPT Output:\n", step0Output);

  let cleanedMarkdown = stripFenced(step0Output || '');
  if (!cleanedMarkdown) {
    console.warn('[acronym Step0] Empty output from GPT. Falling back to local postprocessMarkdown.');
    cleanedMarkdown = postprocessMarkdown(markdown, req.file?.mimetype || req.body.sourceType);
  }
  markdown = cleanedMarkdown;

  if (process.env.RETURN_MARKDOWN_ONLY === "true") {
    return res.json({ processedMarkdown: markdown });
  }

  // Step 1: Extract terms/groups
  const step1SystemPrompt = `
You are an academic assistant helping students prepare for exams.

Tasks:
1. From the provided Markdown (cleaned by Step 1), extract only items from bulleted lists that contain a clear term or concept.
- If a bullet has the form Term: definition or Term – definition, the term is only the part before the colon or dash.
- If a bullet is a single word or short phrase (less than 20 words), consider that the term.
- Ignore bullets that are purely descriptive sentences, repeated explanations, or notes.
- Ignore terms that are strings of special characters, formatting artifacts, code snippets, or non-text elements.
- Only include meaningful, educational concepts useful for exam revision.

2. Create group titles based on the "##" headings that immediately precede the lists.
- If no heading exists, create one based on its terms.

3. Only include groups that contain 2 or more extracted terms.

4. Organize the extracted terms into groups using the created group titles.

5. Do not create acronyms, mnemonics, or new terms — only extract what is explicitly present in the Markdown.

Return strict JSON only in this format:
{
  "title": "<Overall title>",
  "groups": [
    {
      "id": "q1",
      "title": "<Group title>",
      "terms": ["Term 1", "Term 2", "Term 3"]
    }
  ]
}

Important:
- Filter out empty or single-term groups.
- Exclude examples, illustrative notes, code outputs, and special characters.
- Only include definable concepts useful for exam revision.



`;

  const step1UserPrompt = `Content to process:\n---\n${markdown}\n---`;

  const step1Output = await generateWithGPT({
    userPrompt: step1UserPrompt,
    systemPrompt: step1SystemPrompt,
    temperature: 0
  });

  console.log("[acronym Step1] Raw GPT Output:\n", step1Output);

  let step1Parsed;
  try {
    step1Parsed = JSON.parse(step1Output.replace(/```json\s*/i, '').replace(/```$/, '').trim());
  } catch (err) {
    console.error(`[acronym Step1] Failed to parse JSON:`, err);
    console.error(`[acronym Step1] Raw Output:\n`, step1Output);
    return res.status(500).json({ error: `Invalid GPT Step1 output for acronym` });
  }

  // Step 2: Generate acronyms & mnemonics
  const step2SystemPrompt = `
You are an academic assistant generating acronyms and mnemonic sentences from JSON input. Follow these rules strictly:

1. Letter Assignment:
- For each term, set "letter" = first character of the first word of the term.
- Preserve all terms exactly as they appear.
2. Mnemonic Sentence (keyPhrase):
- Must have exactly the same number of words as terms.
- Each word must start with the corresponding "letter" of that term, in order.
- Include repeated letters; do not skip, merge, or drop any.
- The words can relate to the meaning of the terms, but must not use the terms themselves.
- If you cannot make a meaningful mnemonic for a letter, use a generic placeholder word starting with that letter (e.g., “Lovely” for “L”), but do not skip or omit any letter.
3. Output Structure:
- Keep all other fields exactly as in the input.
- Output must be valid JSON with this schema:


{
  "title": "<Overall title>",
  "acronymGroups": [
    {
      "id": "q1",
      "keyPhrase": "<Mnemonic sentence>",
      "title": "<Group title>",
      "contents": [
        { "letter": "<First letter>", "word": "<Term 1>" },
        { "letter": "<First letter>", "word": "<Term 2>" }
      ]
    }
  ]
}

4. Critical Rule:
- Do not skip, merge, or alter the order of letters.
- Do not modify terms.
- Do not reduce repeated letters in the mnemonic.

Return only valid JSON.
`;

  const step2UserPrompt = `Here is the extracted data:\n---\n${JSON.stringify(step1Parsed, null, 2)}\n---`;

  const step2Output = await generateWithGPT({
    userPrompt: step2UserPrompt,
    systemPrompt: step2SystemPrompt,
    temperature: 0
  });

  console.log("[acronym Step2] Raw GPT Output:\n", step2Output);
  

  let step2Parsed;
  try {
    step2Parsed = JSON.parse(step2Output.replace(/```json\s*/i, '').replace(/```$/, '').trim());
  } catch (err) {
    console.error(`[acronym Step2] Failed to parse JSON:`, err);
    console.error(`[acronym Step2] Raw Output:\n`, step2Output);
    return res.status(500).json({ error: `Invalid GPT Step2 output for acronym` });
  }

  // Comment this out to enable Step 3 validation (09/22)
  parsed = step2Parsed;
// 

//Uncomment below to enable Step 3 validation if you want to include step 3 again. (09/22)
//  Step 3: Validation & Finalization
//   const step3SystemPrompt = `
// You are a validator and corrector for acronym mnemonics. Follow these rules strictly:

// 1. Letter Accuracy:
// - Each "letter" field must exactly match the first character of the corresponding "word".
// - Correct any mismatches; do not remove or change any terms.

// 2. Mnemonic Sentence (keyPhrase) Accuracy:
// - The "keyPhrase" must have exactly one word for each letter, in order.
// - Each word in the sentence must start with the corresponding "letter", including repeated letters.
// - Do not skip, merge, or omit any letters.
// - The words can relate to the meaning of the terms but must not repeat the terms themselves.
// - If a meaningful word cannot be found for a letter, use a generic placeholder starting with that letter.

// 3. Preserve Terms and Order:
// - Do not change the "word" fields or their order.
// - Only correct the "letter" and "keyPhrase" fields as needed.
// - If a field in "letter" matches the "keyPhase" field, leave it unchanged (preserve as is).

// 4. Output Format:
// - Return only valid JSON with the exact same schema as input.
// - Maintain all other fields exactly as in the input.

// Example Correction
// Input (problematic):
// {
//   "keyPhrase": "Smart Tech Operates Rapidly",
//   "title": "Software Components",
//   "contents": [
//     { "letter": "S", "word": "Server" },
//     { "letter": "T", "word": "Thread Pool" },
//     { "letter": "O", "word": "Operating System" },
//     { "letter": "R", "word": "Router" },
//     { "letter": "R", "word": "Registry" }
//   ]
// }
// Problem:
// - The original keyPhrase has only one “R” word (Rapidly) but there are two “R” letters in the contents.

// Corrected Output:
// {
//   "keyPhrase": "Smart Tech Operates Rapidly Reliably",
//   "title": "Software Components",
//   "contents": [
//     { "letter": "S", "word": "Server" },
//     { "letter": "T", "word": "Thread Pool" },
//     { "letter": "O", "word": "Operating System" },
//     { "letter": "R", "word": "Router" },
//     { "letter": "R", "word": "Registry" }
//   ]
// }
// Explanation of the correction:
// - Each word in keyPhrase now corresponds exactly to the letter of the term.
// - Both "R" entries are preserved and reflected in the mnemonic.
// - Order of terms is maintained.
// - No letters or terms are skipped, merged, or altered.

// `;

//   const step3UserPrompt = `
// Here is the generated JSON from Step 2:
// ${JSON.stringify(step2Parsed, null, 2)}
// `;

//   const step3Output = await generateWithGPT({
//     userPrompt: step3UserPrompt,
//     systemPrompt: step3SystemPrompt,
//     temperature: 0
//   });

//   console.log("[acronym Step3] Raw GPT Output:\n", step3Output);

//   try {
//     parsed = JSON.parse(step3Output.replace(/```json\s*/i, '').replace(/```$/, '').trim());
//   } catch (err) {
//     console.error(`[acronym Step3] Failed to parse JSON:`, err);
//     console.error(`[acronym Step3] Raw Output:\n`, step3Output);
//     parsed = step2Parsed; // fallback if validation fails
//   }



} else if (featureType === 'terms') {
  // --------------------------
  // Two-step flow for Terms
  // --------------------------
  const step1SystemPrompt = `
You are an academic assistant.

Tasks:
1. Clean the provided text: fix formatting, normalize headings, lists, and spacing.
2. Identify and extract ALL possible terms, concepts, or keywords that are explicitly defined or explained in the text.
   - Include acronyms, technical jargon, commands, principles, and key subject terms.
   - A "definition" means any sentence or phrase that explains what the term is, what it means, or it's purpose.
   - If a term is mentioned but not defined, do not include it.
   - If a term has multiple valid definitions in the text, merge them into a single clear definition.
3. Definitions should not contain the term itself at the beginning (avoid circular definitions).
4. If the definition is too long, condense it while preserving the original meaning.

Return strict JSON in this format:

{
  "title": "<Overall title>",
  "questions": [
    {
      "id": "q1",
      "term": "<Term or concept>",
      "definition": "<Definition text only>"
    }
  ]
}}
  
`;

  const step1UserPrompt = `Content to process:\n---\n${markdown}\n---`;

  const step1Output = await generateWithGPT({
    userPrompt: step1UserPrompt,
    systemPrompt: step1SystemPrompt,
    temperature: 0
  });

  // GPT raw output for first step, for debugging.
  console.log("[terms Step1] Raw GPT Output:\n", step1Output);

  let step1Parsed;
  try {
    step1Parsed = JSON.parse(step1Output.replace(/```json\s*/i, '').replace(/```$/, '').trim());
  } catch (err) {
    console.error(`[terms Step1] Failed to parse JSON:`, err);
    console.error(`[terms Step1] Raw Output:\n`, step1Output);
    return res.status(500).json({ error: `Invalid GPT Step1 output for terms` });
  }

  // Step 2: add distractors aka final output
  const step2SystemPrompt = `
You are an exam-prep assistant.

Based on the provided JSON of terms and correct definitions, create multiple-choice style data:

Rules:
- Keep the correct definition exactly as given.
- Add 3 wrong options (distractors) that are plausible but incorrect.  2 wrong options should have long definition (30 words). 1 wrong option should be short (15 words).
- Wrong options must not be identical to the correct definition.
- Wrong options must be conceptually related but distinct.
- Return strict JSON in this schema:

{
  "title": "<Overall title of the content>",
  "questions": [
    {
      "id": "q1",
      "term": "<Term or concept>",
      "definition": [
        { "text": "<CORRECT DEFINITION>", "type": "correct" },
        { "text": "<WRONG OPTION 1>", "type": "wrong" },
        { "text": "<WRONG OPTION 2>", "type": "wrong" },
        { "text": "<WRONG OPTION 3>", "type": "wrong" }
      ]
    }
  ]
}
  `;

  const step2UserPrompt = `Here is the extracted data:\n---\n${JSON.stringify(step1Parsed, null, 2)}\n---`;

  const step2Output = await generateWithGPT({
    userPrompt: step2UserPrompt,
    systemPrompt: step2SystemPrompt,
    temperature: 0
  });

  // GPT raw output for second step, for debugging.
  console.log("[terms Step1] Raw GPT Output:\n", step2Output);

  try {
    parsed = JSON.parse(step2Output.replace(/```json\s*/i, '').replace(/```$/, '').trim());
  } catch (err) {
    console.error(`[terms Step2] Failed to parse JSON:`, err);
    console.error(`[terms Step2] Raw Output:\n`, step2Output);
    return res.status(500).json({ error: `Invalid GPT Step2 output for terms` });
  }

} else {
  // --------------------------
  // Single-step flow for summarize/explain
  // --------------------------
  const userPrompt = `Content to process:\n---\n${markdown}\n---`;

  const gptOutput = await generateWithGPT({ userPrompt, systemPrompt, temperature });

  // GPT raw output for debugging. for summarize/explain.
  console.log(`[${featureType} Raw GPT Output]:\n`, gptOutput);

  try {
    parsed = JSON.parse(gptOutput.replace(/```json\s*/i, '').replace(/```$/, '').trim());
  } catch (err) {
    console.error(`[${featureType} GPT] Failed to parse JSON:`, err);
    console.error(`[${featureType} GPT] Raw Output:\n`, gptOutput);
    return res.status(500).json({ error: `Invalid GPT output for ${featureType}` });
  }
}


    // ---------------------
    // Firestore Saving
    // ---------------------
    const reviewerRef = db
      .collection('users')
      .doc(uid)
      .collection('folders')
      .doc(folderId)
      .collection('reviewers')
      .doc(reviewerId);

    switch (featureType) {
      case 'acronym': {
        await reviewerRef.set({ id: reviewerId, title: parsed.title || 'Untitled', createdAt: new Date() });

        const saveBatch = db.batch();
        for (const group of parsed.acronymGroups || []) {
          const contentRef = reviewerRef.collection('content').doc(group.id);
          saveBatch.set(contentRef, { id: group.id, keyPhrase: group.keyPhrase, title: group.title });

          group.contents.forEach((item, index) => {
            const itemRef = contentRef.collection('contents').doc(index.toString());
            saveBatch.set(itemRef, { letter: item.letter, word: item.word });
          });
        }
        await saveBatch.commit();
        break;
      }

      case 'terms': {
        await reviewerRef.set({ id: reviewerId, title: parsed.title || 'Untitled', createdAt: new Date() });

        const saveBatch = db.batch();
        for (const q of parsed.questions || []) {
          if (!q?.term || !Array.isArray(q.definition)) continue;

          const definitions = q.definition
            .filter(d => d?.text && d?.type)
            .map(d => ({ text: d.text.trim(), type: d.type }));

          if (definitions.length === 0) continue;

          const qRef = reviewerRef.collection('questions').doc(q.id || undefined);
          saveBatch.set(qRef, { term: q.term.trim(), definition: definitions });
        }
        await saveBatch.commit();
        break;
      }

      case 'summarize':
      case 'explain': {
        const reviewerData = { id: reviewerId, reviewers: [parsed], createdAt: new Date() };
        await reviewerRef.set(reviewerData);
        break;
      }
    }

    // --------------------
    // Return consistent response
    // -------------------------
    res.json({ reviewers: [{ id: reviewerId, ...parsed }] });

  } catch (err) {
    console.error(`[${featureType} Feature] Error:`, err);
    res.status(400).json({ error: err.message || `Failed to process ${featureType}` });
  }
}

// --------------
// Exported Feature Functions
// -------------------------
export const acronymFeature = (req, res) => processFeature(req, res, 'acronym');
export const termsFeature = (req, res) => processFeature(req, res, 'terms');
export const summarizeFeature = (req, res) => processFeature(req, res, 'summarize');
export const explainFeature = (req, res) => processFeature(req, res, 'explain');
