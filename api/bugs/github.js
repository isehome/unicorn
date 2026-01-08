/**
 * GitHub API Integration for Bug Reports
 *
 * Handles:
 * - Creating branches for bug reports
 * - Committing markdown files and attachments
 * - Opening pull requests
 * - Deleting files when bugs are fixed
 */

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'isehome';
const REPO_NAME = 'unicorn';

/**
 * Make an authenticated GitHub API request
 */
async function githubRequest(endpoint, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GitHub] API error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Get the SHA of the main branch
 */
async function getMainBranchSha() {
  const data = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/main`);
  return data.object.sha;
}

/**
 * Create a new branch from main
 */
async function createBranch(branchName) {
  const mainSha = await getMainBranchSha();

  try {
    const data = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: mainSha
      })
    });
    console.log(`[GitHub] Created branch: ${branchName}`);
    return data;
  } catch (err) {
    // Branch might already exist
    if (err.message.includes('Reference already exists')) {
      console.log(`[GitHub] Branch already exists: ${branchName}`);
      return { ref: `refs/heads/${branchName}` };
    }
    throw err;
  }
}

/**
 * Get the SHA of a file (if it exists)
 */
async function getFileSha(path, branch = 'main') {
  try {
    const data = await githubRequest(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${branch}`
    );
    return data.sha;
  } catch (err) {
    // File doesn't exist
    return null;
  }
}

/**
 * Create or update a file in the repository
 */
async function commitFile(path, content, message, branch) {
  // Check if file exists to get SHA for update
  const existingSha = await getFileSha(path, branch);

  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      body: JSON.stringify(body)
    }
  );

  console.log(`[GitHub] Committed file: ${path} on ${branch}`);
  return data;
}

/**
 * Create or update a file with raw base64 content (for binary files like images)
 */
async function commitFileRaw(path, base64Content, message, branch) {
  // Check if file exists to get SHA for update
  const existingSha = await getFileSha(path, branch);

  const body = {
    message,
    content: base64Content, // Already base64 encoded
    branch
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      body: JSON.stringify(body)
    }
  );

  console.log(`[GitHub] Committed file (raw): ${path} on ${branch}`);
  return data;
}

/**
 * Delete a file from the repository
 */
async function deleteFile(path, message, branch = 'main') {
  const sha = await getFileSha(path, branch);
  if (!sha) {
    console.log(`[GitHub] File not found for deletion: ${path}`);
    return null;
  }

  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'DELETE',
      body: JSON.stringify({
        message,
        sha,
        branch
      })
    }
  );

  console.log(`[GitHub] Deleted file: ${path}`);
  return data;
}

/**
 * Create a pull request
 */
async function createPullRequest(title, body, headBranch, baseBranch = 'main') {
  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        head: headBranch,
        base: baseBranch
      })
    }
  );

  console.log(`[GitHub] Created PR #${data.number}: ${title}`);
  return data;
}

/**
 * Check if a PR already exists for a branch
 */
async function getPullRequestForBranch(branchName) {
  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?head=${REPO_OWNER}:${branchName}&state=open`
  );
  return data.length > 0 ? data[0] : null;
}

/**
 * Close a pull request
 */
async function closePullRequest(prNumber) {
  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'closed'
      })
    }
  );

  console.log(`[GitHub] Closed PR #${prNumber}`);
  return data;
}

/**
 * Delete a branch
 */
async function deleteBranch(branchName) {
  try {
    await githubRequest(
      `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${branchName}`,
      { method: 'DELETE' }
    );
    console.log(`[GitHub] Deleted branch: ${branchName}`);
    return true;
  } catch (err) {
    console.error(`[GitHub] Failed to delete branch ${branchName}:`, err.message);
    return false;
  }
}

/**
 * Commit a bug report and its attachments to a new branch, then open a PR
 *
 * @param {string} bugId - The bug report ID (e.g., BR-2026-01-07-0001)
 * @param {string} markdownContent - The markdown file content
 * @param {string} screenshotBase64 - The screenshot as base64 data URL
 * @param {string} summary - Short summary for commit/PR title
 * @returns {Object} Result with branch name and PR URL
 */
async function commitBugReport(bugId, markdownContent, screenshotBase64, summary) {
  // Generate paths
  const dateFolder = bugId.substring(3, 10); // Extract YYYY-MM from BR-YYYY-MM-DD-####
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const branchName = `bug-report/${bugId}`;
  const mdPath = `bug-reports/${dateFolder}/${bugId}-${slug}.md`;
  const screenshotPath = `bug-reports/attachments/${bugId}/screenshot.jpg`;

  // Create branch
  await createBranch(branchName);

  // Commit markdown file
  await commitFile(
    mdPath,
    markdownContent,
    `Bug Report: ${summary.slice(0, 60)}`,
    branchName
  );

  // Commit screenshot if provided
  if (screenshotBase64) {
    // Extract raw base64 from data URL
    const base64Data = screenshotBase64.includes(',')
      ? screenshotBase64.split(',')[1]
      : screenshotBase64;

    // Commit the screenshot using raw base64 (commitFile will handle encoding)
    await commitFileRaw(
      screenshotPath,
      base64Data,
      `Add screenshot for ${bugId}`,
      branchName
    );
  }

  // Create PR
  const prBody = `## Bug Report: ${summary}

**Bug ID:** \`${bugId}\`

This PR contains an AI-analyzed bug report.

### Files
- \`${mdPath}\` - Full bug report with AI analysis
${screenshotBase64 ? `- \`${screenshotPath}\` - Screenshot` : ''}

### Next Steps
1. Review the AI analysis in the markdown file
2. Implement the suggested fix
3. Delete the bug report files when fixed

---
*Generated by Unicorn AI Bug Analyzer*`;

  const pr = await createPullRequest(
    `[Bug] ${summary.slice(0, 60)}`,
    prBody,
    branchName
  );

  return {
    branch: branchName,
    mdPath,
    screenshotPath: screenshotBase64 ? screenshotPath : null,
    prUrl: pr.html_url,
    prNumber: pr.number
  };
}

/**
 * Delete a bug report and close its PR
 *
 * @param {string} bugId - The bug report ID
 * @param {string} mdPath - Path to the markdown file
 * @param {number} prNumber - PR number to close
 */
async function deleteBugReport(bugId, mdPath, prNumber) {
  const branchName = `bug-report/${bugId}`;
  const screenshotPath = `bug-reports/attachments/${bugId}/screenshot.jpg`;

  // Close PR if exists
  if (prNumber) {
    try {
      await closePullRequest(prNumber);
    } catch (err) {
      console.error(`[GitHub] Failed to close PR #${prNumber}:`, err.message);
    }
  }

  // Delete branch (this will also effectively remove the files from that branch)
  await deleteBranch(branchName);

  // Optionally delete files from main if they were merged
  // (Usually you'd just delete the branch, but if files exist on main, delete them)
  try {
    await deleteFile(mdPath, `Fixed: ${bugId}`, 'main');
  } catch (err) {
    // File might not exist on main (PR wasn't merged)
  }

  try {
    await deleteFile(screenshotPath, `Fixed: ${bugId}`, 'main');
  } catch (err) {
    // Screenshot might not exist
  }

  return { deleted: true };
}

/**
 * List bug report files from the repository
 */
async function listBugReports() {
  try {
    const data = await githubRequest(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/bug-reports`
    );

    // Get all month folders
    const folders = data.filter(item => item.type === 'dir' && /^\d{4}-\d{2}$/.test(item.name));
    const reports = [];

    for (const folder of folders) {
      const files = await githubRequest(folder.url);
      const mdFiles = files.filter(f => f.name.endsWith('.md') && f.name.startsWith('BR-'));
      reports.push(...mdFiles.map(f => ({
        name: f.name,
        path: f.path,
        sha: f.sha,
        downloadUrl: f.download_url
      })));
    }

    return reports;
  } catch (err) {
    // Directory might not exist yet
    if (err.message.includes('404')) {
      return [];
    }
    throw err;
  }
}

/**
 * Get a bug report file content
 */
async function getBugReportContent(path) {
  const data = await githubRequest(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`
  );

  // Decode base64 content
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return content;
}

/**
 * Get a screenshot from GitHub (returns base64 data URL)
 */
async function getBugScreenshot(bugId, branch = null) {
  const screenshotPath = `bug-reports/attachments/${bugId}/screenshot.jpg`;
  const branchToUse = branch || `bug-report/${bugId}`;

  try {
    const data = await githubRequest(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${screenshotPath}?ref=${branchToUse}`
    );

    // Return as data URL
    return `data:image/jpeg;base64,${data.content.replace(/\n/g, '')}`;
  } catch (err) {
    // Try main branch if bug report branch doesn't exist
    if (branch !== 'main') {
      try {
        const data = await githubRequest(
          `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${screenshotPath}?ref=main`
        );
        return `data:image/jpeg;base64,${data.content.replace(/\n/g, '')}`;
      } catch {
        // Screenshot not found
        return null;
      }
    }
    return null;
  }
}

module.exports = {
  githubRequest,
  getMainBranchSha,
  createBranch,
  commitFile,
  commitFileRaw,
  deleteFile,
  createPullRequest,
  getPullRequestForBranch,
  closePullRequest,
  deleteBranch,
  commitBugReport,
  deleteBugReport,
  listBugReports,
  getBugReportContent,
  getBugScreenshot,
  getFileSha
};
