const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
    // Public endpoint - no auth required
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');

    try {
        const agentPath = path.join(process.cwd(), 'public', 'AGENT.md');

        if (fs.existsSync(agentPath)) {
            const content = fs.readFileSync(agentPath, 'utf-8');
            res.status(200).send(content);
        } else {
            const docsPath = path.join(process.cwd(), 'public', 'docs', 'AGENT.md');
            if (fs.existsSync(docsPath)) {
                const content = fs.readFileSync(docsPath, 'utf-8');
                res.status(200).send(content);
            } else {
                res.status(404).send('AGENT.md not found');
            }
        }
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
};
