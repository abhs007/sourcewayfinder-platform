import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../web/src/styles.css';
import { Registration } from './Registration';
import verizonRegistration from '../../../domains/verizon-sim-protection/registration.proposed.json';

type RecordData = Record<string, unknown> & { id: string };
type Dashboard = {
  csrfToken: string;
  flows: RecordData[];
  proposals: RecordData[];
  releases: RecordData[];
  sources: RecordData[];
  audit: RecordData[];
};
const text = (v: unknown, fallback = '—') =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const gateNames: Record<string, string> = {
  source_revalidation: 'Source evidence revalidation',
  interpretation_review: 'Source interpretation',
  expected_answer_review: 'Expected answers and acceptance tests',
  merge_review: 'Merge candidate',
  deployment_review: 'Production deployment',
  interpretation: 'Source interpretation',
  expectations: 'Expected answers and acceptance tests',
  merge: 'Merge candidate',
  deploy: 'Production deployment',
};
const formatDate = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString() : text(v);
function ItemTitle({ item }: { item: RecordData }) {
  return (
    <>
      <h2>{text(item.title, text(item.flowId, item.id))}</h2>
      <p>{text(item.state, text(item.status, 'Awaiting review'))}</p>
    </>
  );
}

export function AdminApp() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [registering, setRegistering] = useState(false);
  const [tab, setTab] = useState<'proposals' | 'releases' | 'sources' | 'flows' | 'audit'>(
    'proposals',
  );
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [kind, setKind] = useState<'proposals' | 'releases' | 'sources'>('proposals');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  const [gate, setGate] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const [decision, setDecision] = useState('approve');
  const requestRef = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  async function read(res: Response) {
    let body: any;
    try {
      body = await res.json();
    } catch {
      throw Error(
        'The review service did not return a readable response. No decision was recorded.',
      );
    }
    if (!res.ok) {
      const message =
        typeof body.message === 'string'
          ? body.message
          : typeof body.error?.message === 'string'
            ? body.error.message
            : res.status === 401 || res.status === 403
              ? 'Your authenticated session cannot perform this action. Sign in again.'
              : 'The request could not be completed.';
      const reference = body.requestId ?? body.error?.requestId;
      throw Error(message + (typeof reference === 'string' ? ` Reference: ${reference}` : ''));
    }
    return body;
  }
  async function refresh() {
    setBusy(true);
    requestRef.current?.abort();
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    try {
      const result = await read(
        await fetch('/admin/v1/dashboard', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: ctrl.signal,
        }),
      );
      if (
        !result ||
        !['flows', 'proposals', 'releases', 'audit'].every((k) => Array.isArray(result[k])) ||
        typeof result.csrfToken !== 'string'
      )
        throw Error('The review dashboard response is incomplete. Decisions are disabled.');
      if (!ctrl.signal.aborted)
        setData({ ...result, sources: Array.isArray(result.sources) ? result.sources : [] });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setData(null);
        setMessage(e instanceof Error ? e.message : 'The review service is unavailable.');
        setFailure(true);
      }
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => requestRef.current?.abort();
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [selected]);
  async function inspect(item: RecordData, type: 'proposals' | 'releases' | 'sources') {
    setBusy(true);
    setMessage('');
    setReason('');
    setChecked(false);
    setDecision('approve');
    setKind(type);
    try {
      const record = await read(
        await fetch(`/admin/v1/${type}/${encodeURIComponent(item.id)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      );
      setSelected(record);
      setGate(
        type === 'sources'
          ? 'source_revalidation'
          : typeof record.nextGate === 'string'
            ? record.nextGate
            : type === 'releases' && record.state === 'deployment_review'
              ? 'deployment_review'
              : '',
      );
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'Could not load this record.');
    } finally {
      setBusy(false);
    }
  }
  const sourceVersion = selected?.latestVersion as Record<string, unknown> | undefined;
  const digest =
    kind === 'sources'
      ? text(sourceVersion?.snapshot_sha256, '')
      : selected
        ? text(selected.digest, text(selected.manifestHash, text(selected.revisionHash, '')))
        : '';
  const validDigest = /^[a-f0-9]{64}$/i.test(digest);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !selected || !validDigest || !gate || !reason.trim() || !checked || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await read(
        await fetch(
          `/admin/v1/${kind}/${encodeURIComponent(selected.id)}/${kind === 'sources' ? 'revalidate' : 'decisions'}`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
            body: JSON.stringify(
              kind === 'sources'
                ? { sourceVersionId: sourceVersion?.id, reason: reason.trim() }
                : { gate, decision, digest, reason: reason.trim() },
            ),
          },
        ),
      );
      setSelected(null);
      setReason('');
      setChecked(false);
      await refresh();
      setFailure(false);
      setMessage(
        kind === 'sources'
          ? 'The source version was revalidated. Guidance remains suspended until separately authorized.'
          : 'Your decision was recorded for the displayed artifact digest.',
      );
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'The decision was not recorded.');
    } finally {
      setBusy(false);
    }
  }
  async function suspend(flow: RecordData) {
    if (!data || busy) return;
    const response = window.prompt(`Reason for suspending ${text(flow.title, flow.id)}:`);
    if (!response?.trim()) return;
    setBusy(true);
    try {
      await read(
        await fetch(`/admin/v1/flows/${encodeURIComponent(flow.id)}/status`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
          body: JSON.stringify({ status: 'under_review', reason: response.trim() }),
        }),
      );
      await refresh();
      setFailure(false);
      setMessage('The flow is under review. Existing sessions must stop guidance.');
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'The flow status was not changed.');
    } finally {
      setBusy(false);
    }
  }
  async function activate(flow: RecordData) {
    if (!data || busy) return;
    const release = data.releases.find((r) => r.id === flow.releaseId);
    if (
      !release ||
      !['verified', 'active'].includes(text(release.state)) ||
      typeof flow.bundleHash !== 'string' ||
      typeof flow.statusEpoch !== 'number'
    )
      return;
    const reason = window.prompt(
      `Activate ${text(flow.title, flow.id)} using verified release ${release.id} and bundle ${flow.bundleHash}? Enter your reason after reviewing the release proof:`,
    );
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await read(
        await fetch(`/admin/v1/flows/${encodeURIComponent(flow.id)}/status`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
          body: JSON.stringify({
            status: 'active',
            reason: reason.trim(),
            releaseId: release.id,
            bundleHash: flow.bundleHash,
            statusEpoch: flow.statusEpoch,
          }),
        }),
      );
      await refresh();
      setFailure(false);
      setMessage(
        'The exact verified release is active. Source freshness and every approval remain enforced.',
      );
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'Activation was rejected.');
    } finally {
      setBusy(false);
    }
  }
  function changeTab(next: typeof tab) {
    setTab(next);
    setSelected(null);
    setMessage('');
  }
  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <a className="wordmark" href="/">
            <span className="brand-symbol" aria-hidden="true">
              ↗
            </span>
            SourceWayfinder
          </a>
          <span className="status-label">Private review workspace</span>
        </div>
      </header>
      <main id="main" className="wrap admin-main">
        <div className="admin-title">
          <div>
            <p className="eyebrow">Your review queue</p>
            <h1 ref={heading} tabIndex={-1}>
              Sources, decisions, releases.
            </h1>
          </div>
          <button
            className="button secondary"
            disabled={busy || registering}
            onClick={() => {
              // Queue refresh does not reload a selected detail record. Close it so
              // decisions made in another browser cannot leave stale review controls.
              setSelected(null);
              setChecked(false);
              setReason('');
              setGate('');
              setMessage('');
              void refresh();
            }}
          >
            {busy ? 'Loading…' : 'Refresh queue'}
          </button>
        </div>
        <div className="admin-notice">
          <p>
            Each decision applies to one gate and one exact artifact digest. Changing the evidence
            or implementation requires a new review.
          </p>
        </div>
        {message && (
          <div
            className={`admin-notice ${failure ? 'error' : ''}`}
            role={failure ? 'alert' : 'status'}
          >
            <p>{message}</p>
          </div>
        )}
        {registering && data ? (
          <Registration
            packet={verizonRegistration}
            busy={busy}
            setBusy={setBusy}
            onClose={() => {
              setRegistering(false);
              void refresh();
            }}
          />
        ) : selected ? (
          <>
            <button className="back-button" disabled={busy} onClick={() => setSelected(null)}>
              ‹ Back to the queue
            </button>
            <div className="review-layout">
              <section className="review-panel" aria-label="Review evidence">
                <p className="eyebrow">
                  {kind === 'proposals'
                    ? 'Change proposal'
                    : kind === 'sources'
                      ? 'Source evidence'
                      : 'Release manifest'}
                </p>
                <h2>{text(selected.title, text(selected.flowId, selected.id))}</h2>
                <p>{text(selected.state, text(selected.status, ''))}</p>
                {['summary', 'interpretation', 'uncertainties'].map((k) =>
                  selected[k] ? (
                    <div key={k}>
                      <h3>{k[0].toUpperCase() + k.slice(1)}</h3>
                      {typeof selected[k] === 'string' ? (
                        <p>{text(selected[k])}</p>
                      ) : (
                        <pre className="evidence-json">{pretty(selected[k])}</pre>
                      )}
                    </div>
                  ) : null,
                )}
                {[
                  'latestVersion',
                  'observations',
                  'sourceVersions',
                  'sources',
                  'sourcePassages',
                  'passages',
                  'diff',
                  'expectedCases',
                  'testRuns',
                  'testResults',
                  'manifest',
                  'candidateManifest',
                  'expectedManifest',
                  'artifacts',
                  'approvals',
                ].map((k) =>
                  selected[k] ? (
                    <div key={k}>
                      <h3>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())}</h3>
                      <pre className="evidence-json" tabIndex={0}>
                        {pretty(selected[k])}
                      </pre>
                    </div>
                  ) : null,
                )}
                <details>
                  <summary>Complete record</summary>
                  <pre className="evidence-json" tabIndex={0}>
                    {pretty(selected)}
                  </pre>
                </details>
              </section>
              {!gate ? (
                <section className="review-panel" aria-label="Review progress">
                  <h2>No decision needed from you right now</h2>
                  <p>
                    {selected.state === 'implementation_authorized'
                      ? 'Source interpretation is approved. The implementation and expected test cases must be submitted before your next review becomes available.'
                      : selected.state === 'expectations_preparation'
                        ? 'The implementation is submitted. Expected test cases are being prepared for your review.'
                        : selected.state === 'test_authorized'
                          ? 'Expected answers are approved. The authorized test run must finish before the next review.'
                          : 'There is no open review gate for this record. Check the recorded decisions and current status for progress.'}
                  </p>
                  <p className="fine-print">
                    Refresh queue to check for updates. You do not need to repeat a recorded
                    approval.
                  </p>
                </section>
              ) : (
                <section className="review-panel">
                  <h2>
                    {kind === 'sources' ? 'Revalidate recovered source' : 'Record your decision'}
                  </h2>
                  <p>
                    Compare the evidence with its sources before approving. Rejection or a revision
                    request also becomes part of the audit trail.
                  </p>
                  <h3>Artifact digest</h3>
                  <code className="digest">
                    {digest || 'No digest supplied — approval is unavailable.'}
                  </code>
                  {!validDigest && (
                    <p role="alert">
                      This record has no valid SHA-256 digest. A new reviewable revision is
                      required.
                    </p>
                  )}
                  <form className="review-form" onSubmit={submit}>
                    <label htmlFor="gate">Review gate</label>
                    <select id="gate" value={gate} disabled aria-describedby="gate-description">
                      <option value="">No review gate is currently open</option>
                      {gate && <option value={gate}>{gateNames[gate] || gate}</option>}
                    </select>
                    <p id="gate-description" className="fine-print">
                      The policy service determines which gate is ready for review.
                    </p>
                    {kind !== 'sources' && (
                      <>
                        <label htmlFor="decision">Decision</label>
                        <select
                          id="decision"
                          value={decision}
                          onChange={(e) => {
                            setDecision(e.target.value);
                            setChecked(false);
                          }}
                          disabled={busy}
                        >
                          <option value="approve">Approve this revision</option>
                          <option value="reject">Reject this revision</option>
                          <option value="revise">Request a revision</option>
                        </select>
                      </>
                    )}
                    <label htmlFor="reason">Reason and review notes</label>
                    <textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={4000}
                      required
                      disabled={busy}
                      placeholder="Describe what you checked and any conditions or unresolved issues."
                    />
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        disabled={busy}
                      />
                      <span>I reviewed this gate and the exact artifact digest shown above.</span>
                    </label>
                    <button
                      className="button"
                      type="submit"
                      disabled={busy || !checked || !reason.trim() || !gate || !validDigest}
                    >
                      {busy
                        ? 'Recording…'
                        : kind === 'sources'
                          ? 'Revalidate this source version'
                          : decision === 'approve'
                            ? `Approve ${gateNames[gate]?.toLowerCase() || 'this gate'}`
                            : decision === 'reject'
                              ? 'Reject this revision'
                              : 'Request a revision'}
                    </button>
                  </form>
                  <p className="fine-print">
                    A recorded decision does not by itself run tests, merge code, or deploy a
                    release. The policy service checks each transition.
                  </p>
                </section>
              )}
            </div>
          </>
        ) : (
          <>
            {data &&
              (!data.flows.some((flow) => flow.id === verizonRegistration.flow.id) ||
                verizonRegistration.sources.some(
                  (source) => !data.sources.some((existing) => existing.id === source.id),
                )) && (
                <div className="registration-start">
                  <div>
                    <h2>Register your first guidance flow</h2>
                    <p>Review the Verizon scope and three official source boundaries.</p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setMessage('');
                      setRegistering(true);
                    }}
                  >
                    Review Verizon setup
                  </button>
                </div>
              )}
            <nav className="admin-tabs" aria-label="Review categories">
              {(['proposals', 'releases', 'sources', 'flows', 'audit'] as const).map((t) => (
                <button
                  key={t}
                  aria-current={tab === t ? 'page' : undefined}
                  onClick={() => changeTab(t)}
                >
                  {t === 'proposals'
                    ? 'Change proposals'
                    : t === 'releases'
                      ? 'Releases'
                      : t === 'sources'
                        ? 'Source checks'
                        : t === 'flows'
                          ? 'Flow availability'
                          : 'Audit trail'}
                  {data && <span> ({data[t].length})</span>}
                </button>
              ))}
            </nav>
            {!data ? (
              <section className="empty-state">
                <h2>{busy ? 'Connecting to your workspace…' : 'Review service unavailable'}</h2>
                <p>
                  {busy
                    ? 'Loading the current evidence and decision records.'
                    : 'Sign in through the protected administration URL, then refresh. No approvals can be recorded until the service is available.'}
                </p>
              </section>
            ) : data[tab].length === 0 ? (
              <section className="empty-state">
                <h2>
                  {tab === 'audit' ? 'No events recorded yet.' : 'Nothing in this queue yet.'}
                </h2>
                <p>
                  Records appear here when the connected services submit work. No example approvals
                  or releases are created automatically.
                </p>
              </section>
            ) : tab === 'audit' ? (
              <div className="table-scroll">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Operation</th>
                      <th scope="col">Actor</th>
                      <th scope="col">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a, i) => (
                      <tr key={a.id || i}>
                        <td>{formatDate(a.createdAt || a.created_at || a.timestamp || a.time)}</td>
                        <td>{text(a.operation, text(a.action))}</td>
                        <td>{text(a.actorId, text(a.actor_id, text(a.actor)))}</td>
                        <td>{text(a.entityId, text(a.entity_id, text(a.subjectId, a.id)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-list">
                {data[tab].map((item) => (
                  <article className="admin-item" key={item.id}>
                    <div>
                      <ItemTitle item={item} />
                      {tab === 'flows' && (
                        <p>Last successful check: {formatDate(item.lastSuccessfulCheckAt)}</p>
                      )}
                    </div>
                    <div className="admin-item-actions">
                      {tab === 'flows' ? (
                        <>
                          <span className="status-label">{text(item.status)}</span>
                          <button
                            className="button secondary"
                            disabled={busy || item.status !== 'active'}
                            onClick={() => void suspend(item)}
                          >
                            Suspend guidance
                          </button>
                          {item.status === 'under_review' &&
                            data.releases.some(
                              (r) =>
                                r.id === item.releaseId &&
                                ['verified', 'active'].includes(text(r.state)),
                            ) && (
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() => void activate(item)}
                              >
                                Activate verified release
                              </button>
                            )}
                        </>
                      ) : (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void inspect(item, tab as 'proposals' | 'releases' | 'sources')
                          }
                        >
                          Review evidence
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <span className="wordmark">SourceWayfinder</span>
          <p>Human decisions. Traceable evidence.</p>
          <a href="https://sourcewayfinder.org">Public website</a>
        </div>
      </footer>
    </>
  );
}
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>,
  );
