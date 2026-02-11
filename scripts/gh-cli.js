#!/usr/bin/env node
/**
 * Local GitHub CLI replacement for Cowork VM
 * Uses the PAT from git remote URL
 */

const { execSync } = require('child_process');

// Extract PAT from git remote
function getToken() {
  const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  const match = remoteUrl.match(/https:\/\/([^@]+)@github\.com/);
  if (!match) throw new Error('No PAT found in git remote URL');
  return match[1];
}

const TOKEN = getToken();
const REPO = 'isehome/unicorn';

async function githubAPI(endpoint, options = {}) {
  const url = `https://api.github.com${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Commands
const commands = {
  // List PRs with optional search
  async 'pr-list'(args) {
    const search = args.join(' ') || '';
    const prs = await githubAPI(`/repos/${REPO}/pulls?state=open&per_page=50`);

    const filtered = search
      ? prs.filter(pr => pr.title.toLowerCase().includes(search.toLowerCase()))
      : prs;

    return filtered.map(pr => ({
      number: pr.number,
      title: pr.title,
      branch: pr.head.ref,
      created: pr.created_at
    }));
  },

  // Get PR details
  async 'pr-view'(args) {
    const prNumber = args[0];
    if (!prNumber) throw new Error('PR number required');

    const pr = await githubAPI(`/repos/${REPO}/pulls/${prNumber}`);
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      branch: pr.head.ref,
      state: pr.state,
      files_url: pr.url + '/files'
    };
  },

  // Get PR files changed
  async 'pr-files'(args) {
    const prNumber = args[0];
    if (!prNumber) throw new Error('PR number required');

    const files = await githubAPI(`/repos/${REPO}/pulls/${prNumber}/files`);
    return files.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions
    }));
  },

  // Close a PR
  async 'pr-close'(args) {
    const prNumber = args[0];
    const comment = args.slice(1).join(' ');
    if (!prNumber) throw new Error('PR number required');

    // Add comment if provided
    if (comment) {
      await githubAPI(`/repos/${REPO}/issues/${prNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: comment })
      });
    }

    // Close the PR
    await githubAPI(`/repos/${REPO}/pulls/${prNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' })
    });

    return { success: true, message: `PR #${prNumber} closed` };
  },

  // Get file content from a branch
  async 'get-file'(args) {
    const [branch, path] = args;
    if (!branch || !path) throw new Error('Branch and path required');

    const content = await githubAPI(`/repos/${REPO}/contents/${path}?ref=${branch}`);
    return Buffer.from(content.content, 'base64').toString('utf-8');
  },

  // List bugs (PRs with [Bug] in title)
  async 'bug-list'() {
    const prs = await githubAPI(`/repos/${REPO}/pulls?state=open&per_page=50`);
    return prs
      .filter(pr => pr.title.includes('[Bug]'))
      .map(pr => ({
        number: pr.number,
        title: pr.title,
        branch: pr.head.ref
      }));
  },

  // Get full bug report
  async 'bug-view'(args) {
    const prNumber = args[0];
    if (!prNumber) throw new Error('PR number required');

    const pr = await githubAPI(`/repos/${REPO}/pulls/${prNumber}`);
    const files = await githubAPI(`/repos/${REPO}/pulls/${prNumber}/files`);

    // Find bug report markdown file
    const bugFile = files.find(f => f.filename.includes('bug-reports/') && f.filename.endsWith('.md'));

    let bugContent = null;
    if (bugFile) {
      try {
        const content = await githubAPI(`/repos/${REPO}/contents/${bugFile.filename}?ref=${pr.head.ref}`);
        bugContent = Buffer.from(content.content, 'base64').toString('utf-8');
      } catch (e) {
        bugContent = 'Could not fetch bug report file';
      }
    }

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      branch: pr.head.ref,
      bugReport: bugContent || pr.body
    };
  }
};

// Main
async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === 'help') {
    console.log(`
GitHub CLI for Cowork VM

Commands:
  pr-list [search]     List open PRs (optional search filter)
  pr-view <number>     View PR details
  pr-files <number>    List files changed in PR
  pr-close <number> [comment]  Close a PR with optional comment
  get-file <branch> <path>     Get file content from branch
  bug-list             List open bug reports
  bug-view <number>    View full bug report
    `);
    return;
  }

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  try {
    const result = await commands[command](args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
