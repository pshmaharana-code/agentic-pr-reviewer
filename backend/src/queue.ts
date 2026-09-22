import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const geminiFallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
const geminiMaxAttempts = 3;

if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function analyzeWithGemini(promptText: string): Promise<string> {
    const models = [geminiModel, geminiFallbackModel].filter((model, index, allModels) => model && allModels.indexOf(model) === index);
    let lastError: Error | undefined;

    for (const model of models) {
        for (let attempt = 1; attempt <= geminiMaxAttempts; attempt += 1) {
            let retryableFailure = true;

            try {
                const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: promptText }]
                        }]
                    })
                });

                if (geminiResponse.ok) {
                    const data = await geminiResponse.json();
                    const report = data.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (typeof report === 'string' && report.trim()) {
                        return report;
                    }

                    throw new Error(`Gemini returned an empty response for model ${model}`);
                }

                const errorText = await geminiResponse.text();
                lastError = new Error(`Gemini API Error (${model}): ${geminiResponse.status} - ${errorText}`);

                if (![429, 500, 502, 503, 504].includes(geminiResponse.status)) {
                    retryableFailure = false;
                    throw lastError;
                }

                if (attempt < geminiMaxAttempts) {
                    const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
                    console.warn(`Gemini ${model} returned ${geminiResponse.status}; retrying in ${delay}ms (attempt ${attempt + 1}/${geminiMaxAttempts})`);
                    await sleep(delay);
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (!retryableFailure) {
                    throw lastError;
                }

                if (attempt === geminiMaxAttempts) {
                    break;
                }

                const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
                console.warn(`Gemini ${model} request failed; retrying in ${delay}ms (attempt ${attempt + 1}/${geminiMaxAttempts})`);
                await sleep(delay);
            }
        }

        if (models.length > 1) {
            console.warn(`Gemini model ${model} was unavailable; trying fallback model.`);
        }
    }

    throw lastError || new Error('Gemini analysis failed without an error response');
}


//Connect to your Docker Redis instance (The Pinboard)
const redisConnection = new IORedis({
    host: 'localhost',
    port: 6380,
    maxRetriesPerRequest: null,
});

// Create the Queue (the ticket manager)
// this manages the list of PRs waiting to be scanned
export const prScanQueue = new Queue('pr-security-scan', {
    connection: redisConnection
});

// Create the Worker (The Chef)
// This constantly watches the pinboard. When a new ticket arrives, it executes this function.
const worker = new Worker('pr-security-scan', async (job) => {
    const { pullRequestId, prNumber } = job.data;

    console.log(`\n👨‍🍳 Chef (Worker) picked up ticket for PR #${job.data.prNumber}`);
    
    try {
        const pr = await prisma.pullRequest.findUnique({
            where: { id: pullRequestId },
            include: { repository: true }
        });

        if(!pr) throw new Error('Pull Request not found in database');
        const { owner, name } = pr.repository;

        console.log(`📥 Fetching code changes for ${owner}/${name}...`);

        const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`, {
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.diff'
            }
        });

        if (!githubResponse.ok) {
            throw new Error(`GitHub API Error: ${githubResponse.status} ${githubResponse.statusText}`);
        }

        const diffText = await githubResponse.text();
        console.log(`✅ Fetched ${diffText.length} characters of code changes.`);

        console.log(`🤖 Analyzing code with Gemini...`)

        // Combine the system instructions and the diff into a single, bulletproof prompt
        const promptText = `You are a strict, senior DevSecOps engineer. Review this pull request code diff from the repository ${owner}/${name}:
            ${diffText}

            Focus ONLY on security vulnerabilities (e.g., exposed API keys, SQL injection, XSS, insecure dependencies). Do NOT comment on code style, formatting, or performance. If the code is secure, respond ONLY with the word 'SECURE'. If you find vulnerabilities, provide a concise list of the exact flaws.`;


        const aiReport = await analyzeWithGemini(promptText);

        console.log(`\n📋 AI SECURITY REPORT:\n${aiReport}\n`);

        const finalStatus = aiReport.trim() === 'SECURE' ? 'passed' : 'failed';

        await prisma.pullRequest.update({
            where: { id: pullRequestId },
            data: { status: finalStatus }
        });

        console.log(`💾 Database status updated to: ${finalStatus}`);
        
        console.log(`🚀 Posting report to GitHub PR #${prNumber}...`);

        // Format the comment with a Markdown for a clean UI on Github
        const commentBody = `### 🛡️ AI Security Gatekeeper Report\n\n${aiReport}\n\n*Status: ${finalStatus.toUpperCase()}*`;

        const commentResponse = await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${prNumber}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ body: commentBody })
        });

        if (commentResponse.ok) {
            console.log(`✅ Successfully posted security report to GitHub!`);
        } else {
            const errorData = await commentResponse.text();
            console.error(`⚠️ Failed to post GitHub comment: ${commentResponse.status} - ${errorData}`);
        }

    } catch (error) {
        console.error(`❌ Job failed:`, error);
        // if the api call fails, update the databse so it isnt stuck "pending" forever 
        await prisma.pullRequest.update({
            where: { id: pullRequestId },
            data: { status: 'failed' }
        });
    } 
}, {
    connection: redisConnection
});

worker.on('failed', (job, err) => {
    console.error(`Worker threw an unhandled error:`, err);
});