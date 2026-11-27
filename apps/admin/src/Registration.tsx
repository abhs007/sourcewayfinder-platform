import React, { useEffect, useRef, useState } from 'react';
import { sourceDocumentLimit } from '../../../packages/core/source-policy';
import {
  registrationPlan,
  type RegistrationPacket,
  type RegistrationDashboard,
} from './registration-plan';

export function Registration({
  packet,
  busy,
  setBusy,
  onClose,
}: {
  packet: RegistrationPacket;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function response<T = unknown>(res: Response): Promise<T> {
    if (!res.ok)
      throw Error(
        res.status === 401 || res.status === 403
          ? 'Your session cannot register sources. Sign in again, then retry.'
          : `Registration request failed (${res.status}). Refresh the queue before retrying.`,
      );
    return res.json() as Promise<T>;
  }
  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || busy || complete) return;
    setBusy(true);
    setFailed(false);
    setMessage('Checking the current registration…');
    try {
      const dashboard = await response<RegistrationDashboard>(
        await fetch('/admin/v1/dashboard', {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      );
      const operations = registrationPlan(packet, dashboard);
      for (const [index, operation] of operations.entries()) {
        setMessage(`Saving registration ${index + 1} of ${operations.length}…`);
        await response(
          await fetch(operation.path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': dashboard.csrfToken },
            body: JSON.stringify(operation.body),
          }),
        );
      }
      const final = await response<RegistrationDashboard>(
        await fetch('/admin/v1/dashboard', {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      );
      if (registrationPlan(packet, final).length)
        throw Error(
          'Some registration records are still missing. Retry to save only the remaining records.',
        );
      setComplete(true);
      setMessage(
        'Registration verified. Source evidence and guidance still require separate review before publication.',
      );
    } catch (error) {
      setFailed(true);
      setConfirmed(false);
      setMessage(
        (error instanceof Error ? error.message : 'Registration could not be verified.') +
          ' Saved records are retained. A retry checks the server and submits only missing records.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="back-button" disabled={busy} onClick={onClose}>
        ‹ Back to the queue
      </button>
      <div className="review-layout">
        <section className="review-panel registration-details" aria-label="Proposed registration">
          <p className="eyebrow">Flow and official sources</p>
          <h2 ref={heading} tabIndex={-1}>
            {packet.flow.title}
          </h2>
          <p>{packet.flow.scope}</p>
          <p className="fine-print">
            Flow ID: <code>{packet.flow.id}</code>
          </p>
          <h3>Official fallback</h3>
          <a href={packet.flow.officialUrl} target="_blank" rel="noreferrer">
            {packet.flow.officialUrl}
          </a>
          <h3>Sources to register</h3>
          <p>
            Each boundary permits the listed path and paths beneath it on the exact origin shown.
          </p>
          <ol className="registration-sources">
            {packet.sources.map((source) => (
              <li key={source.id}>
                <h4>{source.title}</h4>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.url}
                </a>
                <dl>
                  <dt>Source ID</dt>
                  <dd>
                    <code>{source.id}</code>
                  </dd>
                  <dt>Allowed origin</dt>
                  <dd>
                    <code>{source.approvedOrigin}</code>
                  </dd>
                  <dt>Allowed path</dt>
                  <dd>
                    <code>{source.approvedPath}</code>
                  </dd>
                  <dt>Raw document limit</dt>
                  <dd>
                    {sourceDocumentLimit(source) / (1024 * 1024)} MiB; collection uses the exact
                    registered URL.
                  </dd>
                </dl>
              </li>
            ))}
          </ol>
        </section>
        <section className="review-panel" aria-label="Registration decision">
          <h2>Authorize source registration</h2>
          <p>
            This creates the flow under review and authorizes collection within the{' '}
            {packet.sources.length} listed source boundaries.
          </p>
          <p>
            It does not approve source interpretations, expected answers, tests, merges or
            deployment.
          </p>
          <form className="review-form" onSubmit={register}>
            <label className="check-label">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || complete}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I reviewed the flow scope and all {packet.sources.length} source boundaries and
                authorize their registration.
              </span>
            </label>
            <button className="button" disabled={!confirmed || busy || complete} type="submit">
              {busy
                ? 'Saving registration…'
                : complete
                  ? 'Registration complete'
                  : 'Register flow and sources'}
            </button>
          </form>
          {message && (
            <p
              className={failed ? 'admin-notice error' : 'admin-notice'}
              role={failed ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}
          <p className="fine-print">
            Your authenticated identity records this action in the audit trail. You can resume a
            partial registration without duplicating matching records.
          </p>
        </section>
      </div>
    </>
  );
}
