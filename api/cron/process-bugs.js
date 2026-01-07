/**
 * Bug Reports AI Processing Cron Job
 * Minimal test version
 */

module.exports = async (req, res) => {
  return res.json({ ok: true, time: Date.now() });
};
