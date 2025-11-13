import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const containerClasses = 'max-w-2xl mx-auto mt-10 p-6 rounded-2xl border shadow-sm bg-white space-y-6';
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1';
const inputClasses = 'w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500';

export default function NotificationTestPage() {
  const { user, acquireToken } = useAuth();
  const [to, setTo] = useState(user?.email || '');
  const [subject, setSubject] = useState('Test notification from Unicorn');
  const [message, setMessage] = useState('This is a test message generated from the notification debug page.');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setResult(null);

    const recipients = to
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      setResult({ type: 'error', message: 'Add at least one recipient email.' });
      return;
    }

    try {
      setSending(true);
      const token = await acquireToken();

      const response = await fetch('/api/send-issue-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          to: recipients,
          subject,
          html: `<p>${message}</p>`,
          text: message
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Request failed (${response.status})`);
      }

      setResult({
        type: 'success',
        message: `Notification sent to ${recipients.join(', ')}`
      });
    } catch (error) {
      setResult({
        type: 'error',
        message: error.message || 'Failed to send notification'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={containerClasses}>
      <div>
        <h1 className="text-2xl font-semibold mb-1">Notification Test Page</h1>
        <p className="text-sm text-gray-600">
          Use this page to send a test email through the same notification endpoint the Issues module uses.
          Comma-separate multiple recipients. Your account token is used automatically so these sends mimic real usage.
        </p>
      </div>

      {result && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            result.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {result.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelClasses}>Recipients</label>
          <input
            className={inputClasses}
            type="text"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="someone@isehome.com, another@example.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            We’ll include your own email automatically if you add it here, so you can test end-to-end delivery.
          </p>
        </div>

        <div>
          <label className={labelClasses}>Subject</label>
          <input
            className={inputClasses}
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div>
          <label className={labelClasses}>Message</label>
          <textarea
            className={`${inputClasses} min-h-[140px]`}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-xl bg-violet-600 text-white font-semibold py-3 shadow hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sending ? 'Sending…' : 'Send Test Notification'}
        </button>
      </form>
    </div>
  );
}
