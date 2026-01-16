import express from 'express';
import logger from '../utils/logger.js';
import { sequenceEngine } from '../services/sequenceEngine.js';

const router = express.Router();

router.get('/available', (req, res) => {
  try {
    res.json({ sequences: sequenceEngine.getAvailableSequences() });
  } catch (error) {
    logger.error('Sequences available Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    res.json(sequenceEngine.getStats());
  } catch (error) {
    logger.error('Sequences stats Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/enroll', (req, res) => {
  try {
    const { contactId, sequenceId } = req.body;

    if (!contactId || !sequenceId) {
      return res.status(400).json({ error: 'contactId und sequenceId erforderlich' });
    }

    const result = sequenceEngine.addContactToSequence(contactId, sequenceId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Sequence enroll Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/enroll/bulk', (req, res) => {
  try {
    const { sequenceId, contactIds } = req.body;

    if (!sequenceId || !Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'sequenceId und contactIds (Array) erforderlich' });
    }

    const result = sequenceEngine.bulkAddToSequence(sequenceId, contactIds);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Sequence bulk enroll Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/process', async (req, res) => {
  try {
    const { limit = 100, dryRun, ignoreDelays = false } = req.body || {};
    const result = await sequenceEngine.processDueSteps({ limit, dryRun, ignoreDelays });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Sequence process Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/tasks', (req, res) => {
  try {
    const { status } = req.query;
    const tasks = sequenceEngine.getTasks({ status });
    res.json({ tasks, total: tasks.length });
  } catch (error) {
    logger.error('Sequence tasks Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/tasks/:taskId/complete', (req, res) => {
  try {
    const { taskId } = req.params;
    const result = sequenceEngine.completeTask(taskId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Sequence complete task Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
