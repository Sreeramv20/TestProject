import { useEffect, useMemo, useState } from 'react';

type Status = {
  status: {
    running: boolean;
    queueDepth: number;
    startedAt?: string;
    lastPollAt?: string;
    nextPollAt?: string;
  };
  stats: {
    totalEntries: number;
    dryRunEntries: number;
    skipped: number;
    failures: number;
    enteredLastHour: number;
    enteredToday: number;
  };
  dryRun: boolean;
};

type Entry = {
  id: string;
  tweetUrl: string;
  authorHandle: string;
  status: string;
  dryRun: boolean;
  createdAt: string;
  parsedInstructions: { rawSummary: string; skippedReasons: string[] };
  actions: Array<{ action: string; ok: boolean; detail?: string; error?: string }>;
};

type Config = {
  search: { terms: string[]; accounts: string[] };
  automation: {
    enabled: boolean;
    dryRun: boolean;
    pollIntervalSeconds: number;
    maxGiveawaysPerHour: number;
    maxGiveawaysPerDay: number;
  };
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export function App() {
  const [status, setStatus] = useState<Status>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [config, setConfig] = useState<Config>();
  const [logs, setLogs] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [error, setError] = useState<string>();

  const refresh = async () => {
    const [nextStatus, nextEntries, nextConfig, nextLogs] = await Promise.all([
      api<Status>('/api/status'),
      api<Entry[]>('/api/entries'),
      api<Config>('/api/config'),
      fetch('/api/logs').then((response) => response.text()),
    ]);
    setStatus(nextStatus);
    setEntries(nextEntries);
    setConfig(nextConfig);
    setLogs(nextLogs);
  };

  useEffect(() => {
    void refresh().catch((err) => setError(String(err)));
    const timer = window.setInterval(() => void refresh().catch((err) => setError(String(err))), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const statusLabel = useMemo(() => {
    if (!status) return 'Loading';
    return status.status.running ? 'Running' : 'Stopped';
  }, [status]);

  const mutate = async (operation: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await operation();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Pokemon TCG automation</p>
          <h1>Giveaway Bot Dashboard</h1>
        </div>
        <span className={status?.status.running ? 'pill live' : 'pill'}>{statusLabel}</span>
      </header>

      {error && <section className="error">{error}</section>}

      <section className="grid cards">
        <article>
          <h2>Controls</h2>
          <div className="button-row">
            <button onClick={() => mutate(() => api('/api/bot/start', { method: 'POST' }))}>Start</button>
            <button onClick={() => mutate(() => api('/api/bot/stop', { method: 'POST' }))}>Stop</button>
            <button onClick={() => mutate(() => api('/api/bot/poll', { method: 'POST' }))}>Poll now</button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config?.automation.enabled)}
              onChange={(event) => mutate(() => api('/api/config/automation', {
                method: 'PATCH',
                body: JSON.stringify({ enabled: event.target.checked }),
              }))}
            />
            Automation enabled
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config?.automation.dryRun)}
              onChange={(event) => mutate(() => api('/api/config/automation', {
                method: 'PATCH',
                body: JSON.stringify({ dryRun: event.target.checked }),
              }))}
            />
            Dry run
          </label>
        </article>

        <article>
          <h2>Stats</h2>
          <dl className="stats">
            <div><dt>Total entries</dt><dd>{status?.stats.totalEntries ?? 0}</dd></div>
            <div><dt>Dry runs</dt><dd>{status?.stats.dryRunEntries ?? 0}</dd></div>
            <div><dt>Skipped</dt><dd>{status?.stats.skipped ?? 0}</dd></div>
            <div><dt>Failures</dt><dd>{status?.stats.failures ?? 0}</dd></div>
            <div><dt>Last hour</dt><dd>{status?.stats.enteredLastHour ?? 0}</dd></div>
            <div><dt>Today</dt><dd>{status?.stats.enteredToday ?? 0}</dd></div>
          </dl>
        </article>
      </section>

      <section className="grid">
        <article>
          <h2>Keywords</h2>
          <form onSubmit={(event) => {
            event.preventDefault();
            void mutate(() => api('/api/config/search/terms', {
              method: 'POST',
              body: JSON.stringify({ term: newKeyword }),
            })).then(() => setNewKeyword(''));
          }}>
            <input value={newKeyword} onChange={(event) => setNewKeyword(event.target.value)} placeholder="pokemon giveaway" />
            <button>Add</button>
          </form>
          <ul>{config?.search.terms.map((term) => <li key={term}>{term}</li>)}</ul>
        </article>

        <article>
          <h2>Monitored accounts</h2>
          <form onSubmit={(event) => {
            event.preventDefault();
            void mutate(() => api('/api/config/search/accounts', {
              method: 'POST',
              body: JSON.stringify({ account: newAccount }),
            })).then(() => setNewAccount(''));
          }}>
            <input value={newAccount} onChange={(event) => setNewAccount(event.target.value)} placeholder="PokemonTCG" />
            <button>Add</button>
          </form>
          <ul>{config?.search.accounts.map((account) => <li key={account}>@{account}</li>)}</ul>
        </article>
      </section>

      <section>
        <h2>Entered giveaways</h2>
        <div className="table">
          {entries.map((entry) => (
            <article key={entry.id} className="entry">
              <a href={entry.tweetUrl} target="_blank" rel="noreferrer">@{entry.authorHandle}</a>
              <span className="pill">{entry.status}</span>
              <p>{entry.parsedInstructions.rawSummary}</p>
              {entry.parsedInstructions.skippedReasons.length > 0 && (
                <small>Skipped: {entry.parsedInstructions.skippedReasons.join(', ')}</small>
              )}
              <small>{new Date(entry.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Logs</h2>
        <pre>{logs}</pre>
      </section>
    </main>
  );
}
