import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  fallbackFlows,
  isFlow,
  isSession,
  safeLink,
  type ApiError,
  type FlowSummary,
  type GuidanceSession,
} from './types';
import './styles.css';

const statusLabel = (s: FlowSummary['status']) =>
  s === 'active'
    ? 'Guidance available'
    : s === 'retired'
      ? 'Archived topic'
      : 'Guidance under review';
const dateLabel = (s: string | null) =>
  s && Number.isFinite(Date.parse(s))
    ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Awaiting source review';
function OfficialLink({
  url,
  children = 'Visit the official source',
}: {
  url?: string;
  children?: React.ReactNode;
}) {
  const href = safeLink(url);
  return href ? (
    <a className="text-link" href={href} rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : null;
}

export function App() {
  const [flows, setFlows] = useState<FlowSummary[]>(fallbackFlows);
  const [directoryState, setDirectoryState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [selected, setSelected] = useState<FlowSummary | null>(null);
  const [session, setSession] = useState<GuidanceSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [choice, setChoice] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const generation = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const currentSession = useRef<GuidanceSession | null>(null);
  const sessionClock = useRef({ startedAt: 0, lastAnsweredAt: 0 });
  currentSession.current = session;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/v1/domains', { signal: ctrl.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const body = (await r.json()) as { domains?: unknown };
        if (!body || !Array.isArray(body.domains) || !body.domains.every(isFlow)) throw Error();
        setFlows(body.domains);
        setDirectoryState('ready');
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setDirectoryState('unavailable');
      });
    return () => ctrl.abort();
  }, []);
  useEffect(() => {
    setChoice('');
    if (selected) heading.current?.focus();
  }, [selected, session?.sequence, error]);

  const stop = useCallback((failure: ApiError) => {
    generation.current++;
    operation.current?.abort();
    setSession(null);
    setHistory([]);
    setPending(false);
    setChoice('');
    setError(failure);
  }, []);
  useEffect(() => {
    if (!session) return;
    const id = session.sessionId,
      flowId = session.flowId,
      epoch = session.statusEpoch;
    let disposed = false;
    let checking = false;
    const ctrl = new AbortController();
    const check = async () => {
      if (disposed || checking || currentSession.current?.sessionId !== id) return;
      if (
        Date.now() - sessionClock.current.startedAt >= 2 * 60 * 60 * 1000 ||
        Date.now() - sessionClock.current.lastAnsweredAt >= 30 * 60 * 1000
      ) {
        stop({
          code: 'SESSION_EXPIRED',
          message: 'Your session expired. Begin again to check the current guidance.',
          officialUrl: session.officialUrl,
        });
        return;
      }
      checking = true;
      try {
        const res = await fetch(`/api/v1/flows/${encodeURIComponent(flowId)}`, {
          cache: 'no-store',
          signal: ctrl.signal,
        });
        if (!res.ok) throw Error();
        const flow = await res.json();
        if (!isFlow(flow) || flow.status !== 'active' || flow.statusEpoch !== epoch) {
          if (!disposed)
            stop({
              code: 'FLOW_CHANGED',
              message:
                'This guidance has changed or is under review. Please use the official source while we check it.',
              officialUrl: session.officialUrl,
            });
        }
      } catch {
        if (!disposed && !ctrl.signal.aborted)
          stop({
            code: 'STATUS_UNAVAILABLE',
            message:
              'We cannot confirm that this guidance is current. The official source is still available.',
            officialUrl: session.officialUrl,
          });
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(check, 30000);
    const visible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const offline = () =>
      stop({
        code: 'OFFLINE',
        message:
          'Your connection was interrupted. Guidance has been cleared; reconnect to begin again.',
        officialUrl: session.officialUrl,
      });
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('offline', offline);
    return () => {
      disposed = true;
      ctrl.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('offline', offline);
    };
  }, [session?.sessionId, session?.statusEpoch, stop]);
  useEffect(() => () => operation.current?.abort(), []);

  async function readResponse(res: Response): Promise<unknown> {
    let data: any;
    try {
      data = await res.json();
    } catch {
      throw {
        code: 'UNAVAILABLE',
        message: 'Guidance is temporarily unavailable. Please use the official source.',
      };
    }
    if (!res.ok)
      throw {
        code: typeof data.code === 'string' ? data.code : 'UNAVAILABLE',
        message:
          typeof data.message === 'string' ? data.message : 'Guidance is temporarily unavailable.',
        requestId: data.requestId,
        officialUrl: data.officialUrl,
      };
    return data;
  }
  async function begin(flow: FlowSummary) {
    const epoch = ++generation.current;
    operation.current?.abort();
    const ctrl = new AbortController();
    operation.current = ctrl;
    setSelected(flow);
    setSession(null);
    setHistory([]);
    setError(null);
    setChoice('');
    if (flow.status !== 'active' || directoryState !== 'ready') {
      setPending(false);
      setError({
        code: 'UNDER_REVIEW',
        message:
          'This guidance is under review. You can continue directly with the responsible organization.',
        officialUrl: flow.officialUrl,
      });
      return;
    }
    setPending(true);
    try {
      const value = await readResponse(
        await fetch('/api/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flowId: flow.id, locale: 'en' }),
          cache: 'no-store',
          signal: ctrl.signal,
        }),
      );
      if (!isSession(value))
        throw {
          code: 'INVALID_RESPONSE',
          message: 'We could not verify the guidance response. Please use the official source.',
        };
      if (epoch === generation.current) {
        sessionClock.current = { startedAt: Date.now(), lastAnsweredAt: Date.now() };
        setSession(value);
      }
    } catch (e) {
      if (epoch === generation.current && !ctrl.signal.aborted) {
        setError(e as ApiError);
        setSession(null);
      }
    } finally {
      if (epoch === generation.current) setPending(false);
    }
  }
  async function answer(event: React.FormEvent) {
    event.preventDefault();
    if (!session || session.step.type !== 'question' || pending || !choice) return;
    const epoch = generation.current,
      before = session,
      question = session.step.question;
    operation.current?.abort();
    const ctrl = new AbortController();
    operation.current = ctrl;
    setPending(true);
    setError(null);
    try {
      const value = await readResponse(
        await fetch(`/api/v1/sessions/${encodeURIComponent(session.sessionId)}/answers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            questionId: question.id,
            choiceId: choice,
            sequence: session.sequence,
          }),
          cache: 'no-store',
          signal: ctrl.signal,
        }),
      );
      const next = { ...before, ...(value as object), token: before.token };
      if (
        !isSession(next) ||
        next.sequence !== before.sequence + 1 ||
        next.bundleHash !== before.bundleHash ||
        next.statusEpoch !== before.statusEpoch
      )
        throw {
          code: 'INVALID_RESPONSE',
          message:
            'This guidance could not be verified. Please begin again or use the official source.',
        };
      if (epoch === generation.current) {
        sessionClock.current.lastAnsweredAt = Date.now();
        setHistory((h) => [...h, question.prompt]);
        setSession(next);
      }
    } catch (e) {
      if (epoch === generation.current && !ctrl.signal.aborted) stop(e as ApiError);
    } finally {
      if (epoch === generation.current) setPending(false);
    }
  }
  function leave() {
    const old = session;
    generation.current++;
    operation.current?.abort();
    setSelected(null);
    setSession(null);
    setError(null);
    setPending(false);
    setHistory([]);
    if (old)
      void fetch(`/api/v1/sessions/${encodeURIComponent(old.sessionId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${old.token}` },
        keepalive: true,
      }).catch(() => undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <a
            className="wordmark"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              leave();
            }}
          >
            <span className="brand-symbol" aria-hidden="true">
              ↗
            </span>
            SourceWayfinder
          </a>
          <nav aria-label="Main navigation">
            <a href="#how-it-works" onClick={() => selected && leave()}>
              How it works
            </a>
            <a href="/survey.html">Share your experience</a>
          </nav>
        </div>
      </header>
      <main id="main" className={selected ? 'guidance-main' : 'home-main'}>
        {!selected ? (
          <>
            <section className="hero wrap" aria-labelledby="home-title">
              <div className="hero-copy">
                <p className="eyebrow">A clearer route through everyday procedures</p>
                <h1 id="home-title">
                  Find your next step.
                  <br />
                  <span>Know what it rests on.</span>
                </h1>
                <p className="lead">
                  Start with your situation. See the conditions that matter and the official sources
                  behind your options.
                </p>
                <div className="hero-note">
                  <span className="small-rule" aria-hidden="true" />
                  <p>
                    Free to use. No account needed.
                    <br />
                    An independent guidance project.
                  </p>
                </div>
              </div>
              <div className="task-panel">
                <div className="panel-heading">
                  <p className="eyebrow">Start here</p>
                  <h2>What do you need help with?</h2>
                </div>
                <div className="task-list">
                  {flows.map((flow, i) => (
                    <article className="task-item" key={flow.id}>
                      <span className="task-index" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3>
                          <button className="task-button" onClick={() => void begin(flow)}>
                            {flow.title}
                            <span className="task-chevron" aria-hidden="true">
                              ›
                            </span>
                          </button>
                        </h3>
                        <p>{flow.scope}</p>
                        <span
                          className={`status-label ${flow.status === 'active' ? 'available' : ''}`}
                        >
                          {statusLabel(flow.status)}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="panel-footnote" role="status">
                  {directoryState === 'loading'
                    ? 'Checking guidance availability…'
                    : directoryState === 'unavailable'
                      ? 'Live guidance is unavailable. Official links remain accessible.'
                      : 'Choose a topic to check its scope and availability.'}
                </p>
              </div>
            </section>
            <section className="principles-section" id="how-it-works">
              <div className="wrap">
                <div className="section-intro">
                  <p className="eyebrow">How it works</p>
                  <h2>
                    Clear conditions.
                    <br />
                    Sources you can check.
                  </h2>
                  <p>
                    Procedures depend on details. We make those details visible, including when the
                    available guidance does not cover your situation.
                  </p>
                </div>
                <div className="principles">
                  <article>
                    <span className="principle-line" />
                    <h3>Your situation comes first</h3>
                    <p>
                      Answer a few general questions. “I’m not sure” is always a valid starting
                      point.
                    </p>
                  </article>
                  <article>
                    <span className="principle-line" />
                    <h3>The source stays in view</h3>
                    <p>
                      Read the official instructions behind a next step, along with its conditions
                      and scope.
                    </p>
                  </article>
                  <article>
                    <span className="principle-line" />
                    <h3>Uncertainty stays visible</h3>
                    <p>
                      When a source changes or needs review, guided answers pause. The official
                      route remains available.
                    </p>
                  </article>
                </div>
              </div>
            </section>
            <section className="official-section wrap" aria-labelledby="official-title">
              <div>
                <p className="eyebrow">Go directly to the source</p>
                <h2 id="official-title">The official routes are always yours.</h2>
                <p>You can use these links without starting a guidance session.</p>
              </div>
              <div className="official-links">
                {fallbackFlows.map((f) => (
                  <OfficialLink key={f.id} url={f.officialUrl}>
                    {f.title}
                  </OfficialLink>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="wrap guidance-layout">
            <aside className="guidance-context">
              <button className="back-button" onClick={leave}>
                ‹ All topics
              </button>
              <p className="eyebrow">Your chosen topic</p>
              <h2>{selected.title}</h2>
              <p>{selected.scope}</p>
              <dl className="source-meta">
                <dt>Last source check</dt>
                <dd>{dateLabel(selected.lastSuccessfulCheckAt)}</dd>
              </dl>
              <p className="privacy-note">
                Please do not enter a name, Social Security number, account number, or identity
                document. This guide only needs general choices.
              </p>
              <OfficialLink url={selected.officialUrl} />
            </aside>
            <section className="guidance-card" aria-live="polite" aria-busy={pending}>
              {error ? (
                <>
                  <span className="status-label">Guidance paused</span>
                  <h1 ref={heading} tabIndex={-1}>
                    Let’s check the official route.
                  </h1>
                  <p className="lead">{error.message || 'Guidance is temporarily unavailable.'}</p>
                  <OfficialLink url={error.officialUrl || selected.officialUrl} />
                  <div className="button-row">
                    <button className="button secondary" onClick={leave}>
                      Choose another topic
                    </button>
                    {selected.status === 'active' && (
                      <button
                        className="button"
                        disabled={pending}
                        onClick={() => void begin(selected)}
                      >
                        Check again
                      </button>
                    )}
                  </div>
                  {error.requestId && (
                    <p className="request-reference">Reference: {error.requestId}</p>
                  )}
                </>
              ) : !session ? (
                <>
                  <p className="eyebrow">Checking the current guidance</p>
                  <h1 ref={heading} tabIndex={-1}>
                    One moment.
                  </h1>
                  <p>We’re confirming the source and the scope before you begin.</p>
                </>
              ) : session.step.type === 'question' ? (
                <form onSubmit={answer}>
                  <p className="eyebrow">Question {history.length + 1}</p>
                  <h1 ref={heading} tabIndex={-1} id="question-title">
                    {session.step.question.prompt}
                  </h1>
                  {session.step.question.help && (
                    <p id="question-help" className="question-help">
                      {session.step.question.help}
                    </p>
                  )}
                  <fieldset
                    aria-labelledby="question-title"
                    aria-describedby={session.step.question.help ? 'question-help' : undefined}
                  >
                    <legend className="sr-only">Choose one answer</legend>
                    <div className="choices">
                      {session.step.question.choices.map((c) => (
                        <label key={c.id} className={`choice ${choice === c.id ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="answer"
                            value={c.id}
                            checked={choice === c.id}
                            disabled={pending}
                            onChange={() => setChoice(c.id)}
                          />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="button-row">
                    <button className="button" type="submit" disabled={!choice || pending}>
                      {pending ? 'Checking…' : 'Continue'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={pending}
                      onClick={() => void begin(selected)}
                    >
                      Start again
                    </button>
                  </div>
                  <p className="fine-print">
                    Your choices stay in this short-lived session. Closing or refreshing this page
                    starts a new session.
                  </p>
                </form>
              ) : (
                <>
                  <p className="eyebrow">Your next step</p>
                  <h1 ref={heading} tabIndex={-1}>
                    {session.step.outcome.title}
                  </h1>
                  <p className="lead">{session.step.outcome.nextStep}</p>
                  {(session.step.outcome.prerequisites ?? []).length > 0 && (
                    <div className="outcome-block">
                      <h2>What needs to be in place</h2>
                      <ul>
                        {(session.step.outcome.prerequisites ?? []).map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {session.step.outcome.unresolved.length > 0 && (
                    <div className="outcome-block">
                      <h2>What still needs checking</h2>
                      <ul>
                        {session.step.outcome.unresolved.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="outcome-block">
                    <h2>Read the sources</h2>
                    <div className="source-list">
                      {session.sources
                        .filter(
                          (s) =>
                            session.step.type === 'outcome' &&
                            session.step.outcome.sourceRefs.includes(s.id),
                        )
                        .map((s) => (
                          <OfficialLink key={s.id} url={s.url}>
                            {s.title}
                          </OfficialLink>
                        ))}
                    </div>
                  </div>
                  <p className="fine-print">
                    This identifies a source-supported next step. The responsible organization
                    confirms the requirements and completes the procedure.
                  </p>
                  <div className="button-row">
                    <button className="button secondary" onClick={leave}>
                      Finish this session
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <a className="wordmark" href="/">
            SourceWayfinder
          </a>
          <p>Independent guidance. Official sources.</p>
          <a href="/survey.html">Share your experience</a>
          <a href="#privacy">Privacy and scope</a>
        </div>
        <div id="privacy" className="wrap privacy-copy">
          <p>
            We do not ask for identifying details in guidance sessions. Choices are held briefly to
            continue your path and expire automatically. The optional survey has its own consent
            notice. SourceWayfinder is independent of the organizations linked here.
          </p>
        </div>
      </footer>
    </>
  );
}
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
