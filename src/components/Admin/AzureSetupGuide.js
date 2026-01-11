/**
 * Azure Setup Guide Component
 *
 * Comprehensive guide for setting up Azure AD App Registration
 * with all required permissions for Unicorn.
 */

import React, { useState } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Shield,
  Mail,
  FolderOpen,
  Users,
  Bell,
} from 'lucide-react';

const AzureSetupGuide = ({ mode = 'light' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  const isDark = mode === 'dark';

  const styles = {
    card: {
      backgroundColor: isDark ? '#18181b' : '#ffffff',
      borderColor: isDark ? '#3f3f46' : '#e4e4e7',
    },
    text: {
      primary: { color: isDark ? '#fafafa' : '#18181b' },
      secondary: { color: isDark ? '#a1a1aa' : '#71717a' },
    },
    code: {
      backgroundColor: isDark ? '#27272a' : '#f4f4f5',
      color: isDark ? '#a5f3fc' : '#0891b2',
    },
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const CopyButton = ({ text, label }) => (
    <button
      onClick={() => copyToClipboard(text, label)}
      className="ml-2 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      title="Copy to clipboard"
    >
      {copiedText === label ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" style={styles.text.secondary} />
      )}
    </button>
  );

  const PermissionRow = ({ name, type, description, required = true }) => (
    <tr className="border-b last:border-b-0" style={{ borderColor: styles.card.borderColor }}>
      <td className="py-2 pr-4">
        <code className="text-xs px-1.5 py-0.5 rounded" style={styles.code}>
          {name}
        </code>
      </td>
      <td className="py-2 pr-4">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          type === 'Application'
            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
        }`}>
          {type}
        </span>
      </td>
      <td className="py-2 text-xs" style={styles.text.secondary}>
        {description}
      </td>
      <td className="py-2 text-center">
        {required ? (
          <span className="text-green-500">✓</span>
        ) : (
          <span style={styles.text.secondary}>○</span>
        )}
      </td>
    </tr>
  );

  const Section = ({ icon: Icon, title, children, color = 'violet' }) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-6 h-6 rounded flex items-center justify-center bg-${color}-500/10`}>
          <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
        </div>
        <h4 className="font-medium text-sm" style={styles.text.primary}>{title}</h4>
      </div>
      {children}
    </div>
  );

  return (
    <div className="rounded-xl border overflow-hidden" style={styles.card}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-violet-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-sm" style={styles.text.primary}>
              Azure AD Setup Guide
            </p>
            <p className="text-xs" style={styles.text.secondary}>
              Step-by-step instructions for configuring permissions
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="w-5 h-5" style={styles.text.secondary} />
        ) : (
          <ChevronRight className="w-5 h-5" style={styles.text.secondary} />
        )}
      </button>

      {isOpen && (
        <div className="border-t p-6 space-y-6" style={{ borderColor: styles.card.borderColor }}>

          {/* Quick Links */}
          <div className="flex flex-wrap gap-2">
            <a
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Azure App Registrations
            </a>
            <a
              href="https://admin.microsoft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Microsoft 365 Admin
            </a>
          </div>

          {/* Step 1: Create App Registration */}
          <Section icon={Shield} title="Step 1: Create or Access App Registration">
            <ol className="list-decimal list-inside space-y-2 text-sm" style={styles.text.secondary}>
              <li>Go to <strong>Azure Portal</strong> → <strong>App Registrations</strong></li>
              <li>Click <strong>New registration</strong> or select your existing Unicorn app</li>
              <li>Name: <code className="px-1.5 py-0.5 rounded text-xs" style={styles.code}>unicorn app</code></li>
              <li>Supported account types: <strong>Single tenant</strong> (your organization only)</li>
              <li>Redirect URI: <strong>Single-page application (SPA)</strong></li>
            </ol>
            <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
              <p className="text-xs font-medium mb-2" style={styles.text.primary}>Redirect URIs:</p>
              <div className="space-y-1">
                {['https://unicorn-one.vercel.app', 'http://localhost:3000'].map(uri => (
                  <div key={uri} className="flex items-center">
                    <code className="text-xs" style={styles.code}>{uri}</code>
                    <CopyButton text={uri} label={uri} />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Step 2: Configure Authentication */}
          <Section icon={Shield} title="Step 2: Configure Authentication">
            <ol className="list-decimal list-inside space-y-2 text-sm" style={styles.text.secondary}>
              <li>Go to <strong>Authentication</strong> in the left menu</li>
              <li>Under <strong>Implicit grant and hybrid flows</strong>, enable:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>Access tokens (for implicit flows)</li>
                  <li>ID tokens (for implicit and hybrid flows)</li>
                </ul>
              </li>
              <li>Set <strong>Supported account types</strong> to match your needs</li>
              <li>Click <strong>Save</strong></li>
            </ol>
          </Section>

          {/* Step 3: Add Client Secret */}
          <Section icon={Shield} title="Step 3: Create Client Secret">
            <ol className="list-decimal list-inside space-y-2 text-sm" style={styles.text.secondary}>
              <li>Go to <strong>Certificates & secrets</strong></li>
              <li>Click <strong>New client secret</strong></li>
              <li>Description: <code className="px-1.5 py-0.5 rounded text-xs" style={styles.code}>Unicorn Production</code></li>
              <li>Expiration: Choose based on your security policy (24 months recommended)</li>
              <li><strong>Copy the secret value immediately</strong> - it won't be shown again!</li>
            </ol>
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                <strong>Important:</strong> Add the secret to your Vercel environment variables as <code>AZURE_CLIENT_SECRET</code>
              </p>
            </div>
          </Section>

          {/* Step 4: API Permissions - Delegated */}
          <Section icon={Users} title="Step 4: API Permissions - Delegated (User Login)">
            <p className="text-xs mb-3" style={styles.text.secondary}>
              These permissions are used when users sign in. They allow the app to act on behalf of the signed-in user.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: styles.card.borderColor }}>
                    <th className="pb-2 text-xs font-medium" style={styles.text.secondary}>Permission</th>
                    <th className="pb-2 text-xs font-medium" style={styles.text.secondary}>Type</th>
                    <th className="pb-2 text-xs font-medium" style={styles.text.secondary}>Purpose</th>
                    <th className="pb-2 text-xs font-medium text-center" style={styles.text.secondary}>Required</th>
                  </tr>
                </thead>
                <tbody>
                  <PermissionRow name="User.Read" type="Delegated" description="Sign in and read user profile" />
                  <PermissionRow name="Calendars.ReadWrite" type="Delegated" description="Create/read/update calendar events" />
                  <PermissionRow name="Calendars.ReadWrite.Shared" type="Delegated" description="Access shared calendars" />
                  <PermissionRow name="Mail.Send" type="Delegated" description="Send email as user" />
                  <PermissionRow name="Mail.ReadWrite" type="Delegated" description="Read/write user's mail" required={false} />
                  <PermissionRow name="Contacts.Read" type="Delegated" description="Read user's contacts" />
                  <PermissionRow name="Files.ReadWrite.All" type="Delegated" description="Access SharePoint files" />
                  <PermissionRow name="offline_access" type="Delegated" description="Maintain access (refresh tokens)" />
                  <PermissionRow name="openid" type="Delegated" description="Sign users in" />
                  <PermissionRow name="profile" type="Delegated" description="View user's basic profile" />
                  <PermissionRow name="email" type="Delegated" description="View user's email address" />
                </tbody>
              </table>
            </div>
          </Section>

          {/* Step 5: API Permissions - Application */}
          <Section icon={Mail} title="Step 5: API Permissions - Application (System Account)">
            <p className="text-xs mb-3" style={styles.text.secondary}>
              These permissions are used by the system account for background operations. They require <strong>Admin Consent</strong>.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: styles.card.borderColor }}>
                    <th className="pb-2 text-xs font-medium" style={styles.text.secondary}>Permission</th>
                    <th className="pb-2 text-xs font-medium" style={styles.text.secondary}>Type</th>
                    <th className="pb-2 text-xs font-medium" style={styles.text.secondary}>Purpose</th>
                    <th className="pb-2 text-xs font-medium text-center" style={styles.text.secondary}>Required</th>
                  </tr>
                </thead>
                <tbody>
                  <PermissionRow name="User.Read.All" type="Application" description="Read all user profiles (system account verification)" />
                  <PermissionRow name="Mail.Send" type="Application" description="Send email as system account" />
                  <PermissionRow name="Calendars.ReadWrite" type="Application" description="Manage system calendar events" />
                  <PermissionRow name="Files.ReadWrite.All" type="Application" description="Access SharePoint files" />
                  <PermissionRow name="Sites.ReadWrite.All" type="Application" description="Manage SharePoint sites" />
                  <PermissionRow name="Group.Read.All" type="Application" description="Query distribution groups" required={false} />
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <p className="text-xs text-violet-600 dark:text-violet-400">
                <strong>Important:</strong> After adding Application permissions, click <strong>"Grant admin consent for [Your Organization]"</strong>
              </p>
            </div>
          </Section>

          {/* Step 6: Environment Variables */}
          <Section icon={FolderOpen} title="Step 6: Environment Variables">
            <p className="text-xs mb-3" style={styles.text.secondary}>
              Add these environment variables to your Vercel project settings:
            </p>
            <div className="space-y-2">
              {[
                { name: 'AZURE_TENANT_ID', desc: 'Directory (tenant) ID from Overview page' },
                { name: 'AZURE_CLIENT_ID', desc: 'Application (client) ID from Overview page' },
                { name: 'AZURE_CLIENT_SECRET', desc: 'Client secret value (from Step 3)' },
                { name: 'REACT_APP_AZURE_CLIENT_ID', desc: 'Same as AZURE_CLIENT_ID (for frontend)' },
                { name: 'REACT_APP_AZURE_TENANT_ID', desc: 'Same as AZURE_TENANT_ID (for frontend)' },
              ].map(env => (
                <div key={env.name} className="flex items-start gap-2 p-2 rounded" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
                  <code className="text-xs font-medium" style={styles.code}>{env.name}</code>
                  <span className="text-xs" style={styles.text.secondary}>— {env.desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Step 7: System Account Setup */}
          <Section icon={Mail} title="Step 7: System Account Mailbox">
            <ol className="list-decimal list-inside space-y-2 text-sm" style={styles.text.secondary}>
              <li>In <strong>Microsoft 365 Admin Center</strong>, create a shared mailbox or user:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>Email: <code className="px-1.5 py-0.5 rounded text-xs" style={styles.code}>unicorn@yourcompany.com</code></li>
                  <li>Display Name: <code className="px-1.5 py-0.5 rounded text-xs" style={styles.code}>Unicorn System</code></li>
                </ul>
              </li>
              <li>Ensure the mailbox has a license that includes email (Exchange Online)</li>
              <li>Configure the system account email in Unicorn Admin → Integrations</li>
            </ol>
          </Section>

          {/* Troubleshooting */}
          <Section icon={Bell} title="Troubleshooting">
            <div className="space-y-3 text-sm" style={styles.text.secondary}>
              <div className="p-3 rounded-lg" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
                <p className="font-medium text-xs mb-1" style={styles.text.primary}>403 "Insufficient privileges" error</p>
                <p className="text-xs">Make sure you've added the permission as <strong>Application</strong> (not Delegated) and clicked "Grant admin consent".</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
                <p className="font-medium text-xs mb-1" style={styles.text.primary}>AADSTS700016 "Application not found"</p>
                <p className="text-xs">Check that AZURE_CLIENT_ID and AZURE_TENANT_ID are correct in your environment variables.</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
                <p className="font-medium text-xs mb-1" style={styles.text.primary}>hash_empty_error on login</p>
                <p className="text-xs">Clear browser cache/cookies, or open the app in an incognito window.</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
                <p className="font-medium text-xs mb-1" style={styles.text.primary}>Mailbox not found error</p>
                <p className="text-xs">Ensure the system account email exists in Microsoft 365 and has a mailbox license.</p>
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};

export default AzureSetupGuide;
