const flowService = require('../services/flowService');
const meta = require('../services/metaService');

// GET /api/flows/status -> { flowId, status, categories }
exports.status = async (req, res) => {
  try {
    const flowId = await flowService.getFlowId();
    const status = await flowService.getFlowStatus();
    let metaInfo = null;
    if (flowId) {
      try { metaInfo = await meta.getFlow(flowId); } catch { /* ignore */ }
    }
    const data = await flowService.buildCategoryFlowData();
    res.json({
      flowId: flowId || null,
      status,
      meta: metaInfo,
      categoryCount: data.categories.length,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// POST /api/flows/publish -> create (if needed) + update JSON + publish.
exports.publish = async (req, res) => {
  try {
    const result = await flowService.ensureFlowPublished();
    res.json({ ok: true, ...result });
  } catch (e) {
    const metaErr = e.response?.data?.error;
    console.error('[flowController.publish]', metaErr || e.message);
    res.status(500).json({
      error: metaErr?.error_user_msg || metaErr?.message || e.message || 'Publish failed',
      details: e.response?.data || e.message,
    });
  }
};

module.exports = exports;
