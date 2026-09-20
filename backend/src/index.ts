import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { prScanQueue } from './queue';
import './queue';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware: Allows JSON parsing and Cross-Origin requests
app.use(cors());
app.use(express.json());

// Health Check Endpoint (Our equivalent of a Flask route)
app.get('/api/health', async (req, res) => {
  try {
    // A simple ping to ensure the database is actually listening
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.post('/api/repositories', async (req, res) => {
  try {
    const { name, owner, url } = req.body;
    const newRepo = await prisma.repository.create({
      data: { name, owner, url },
    });
    res.status(201).json(newRepo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create repository' });
  }
});

app.get('/api/repositories', async (req, res) => {
  try {
    const repos = await prisma.repository.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});


// Github Webhook Listener for Pull Requests
app.post('/api/webhooks/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];

    if (event === 'pull_request') {
      const { action, pull_request, repository } = req.body;

      if (action === 'opened' || action === 'synchronize') {
        let dbRepo = await prisma.repository.findFirst({
          where: { url: repository.html_url }
        });

        if (!dbRepo) {
          dbRepo = await prisma.repository.create({
            data: {
              name: repository.name,
              owner: repository.owner.login,
              url: repository.html_url
            }
          });
        }
        const newPr = await prisma.pullRequest.create({
          data: {
            prNumber: pull_request.number,
            title: pull_request.title,
            status: 'pending',
            repositoryId: dbRepo.id
          }
        });

        console.log(`📥 Received PR #${pull_request.number}: "${pull_request.title}"`);
        console.log(`⏳ Queuing for AI Security Analysis...`);

        await prScanQueue.add('scan-pr', {
          pullRequestId: newPr.id,
          prNumber: pull_request.number
        });

        return res.status(200).json({ message: 'PR logged securely', pullRequestId: newPr.id});
      }
    }

    res.status(200).json({ message: 'Webhook received but ignored' });
  } catch (error) {
      console.error('Webhook Error:', error);
      res.status(500).json({ error: 'Failed to process GitHub Webhook' });
  }
});







// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Gatekeeper API is running on http://localhost:${PORT}`);
});