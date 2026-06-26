import { useState, useEffect, useRef } from 'react';
import {
  getSaleStatus,
  attemptPurchase,
  getPurchaseStatus,
  type SaleStatus,
  type PurchaseResultValue,
} from './api';

const STORAGE_KEY = 'flash_userId';
const POLL_INTERVAL_MS = 5000;

const FEEDBACK: Record<PurchaseResultValue | 'network_error', string> = {
  success: 'You got it! Purchase confirmed.',
  already_purchased: "You've already purchased this item.",
  sold_out: 'Sorry — sold out.',
  sale_not_active: 'Sale is not currently active.',
  invalid_request: 'Something went wrong. Please try again.',
  network_error: 'Something went wrong. Please try again.',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function App() {
  const [saleStatus, setSaleStatus] = useState<SaleStatus | null>(null);
  const [userId, setUserId] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [buying, setBuying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll sale status every 5 seconds
  useEffect(() => {
    async function poll() {
      try {
        const status = await getSaleStatus();
        setSaleStatus(status);
      } catch {
        // leave previous status visible; network blip
      }
    }

    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  // On mount with userId, restore purchased state from backend
  useEffect(() => {
    if (!userId.trim()) return;
    getPurchaseStatus(userId)
      .then((s) => {
        if (s.purchased) setPurchased(true);
      })
      .catch(() => {/* non-fatal */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  function handleUserIdChange(value: string) {
    setUserId(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* quota/private mode — non-fatal */ }
    setFeedback(null);
    if (value.trim() !== userId.trim()) setPurchased(false);
  }

  async function handleBuy() {
    if (!userId.trim() || saleStatus?.status !== 'active' || buying || purchased) return;
    setBuying(true);
    setFeedback(null);
    try {
      const result = await attemptPurchase(userId.trim());
      const message = FEEDBACK[result.result] ?? FEEDBACK.network_error;
      setFeedback(message);
      if (result.result === 'success') setPurchased(true);
    } catch {
      setFeedback(FEEDBACK.network_error);
    } finally {
      setBuying(false);
    }
  }

  const isActive = saleStatus?.status === 'active';
  const canBuy = isActive && userId.trim().length > 0 && !purchased && !buying;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Flash Sale</h1>

        {saleStatus ? (
          <div style={styles.statusBlock}>
            <span style={{ ...styles.badge, ...badgeColor(saleStatus.status) }}>
              {saleStatus.status.replace('_', ' ')}
            </span>
            {isActive && (
              <p style={styles.stock}>
                {saleStatus.stockRemaining} item{saleStatus.stockRemaining !== 1 ? 's' : ''} remaining
              </p>
            )}
            <p style={styles.dateRow}>
              <span>Opens: {formatDate(saleStatus.saleStart)}</span>
              <span style={{ marginLeft: 16 }}>Closes: {formatDate(saleStatus.saleEnd)}</span>
            </p>
          </div>
        ) : (
          <p style={styles.loading}>Loading sale status…</p>
        )}

        <div style={styles.inputGroup}>
          <label htmlFor="userId" style={styles.label}>
            Email or Username
          </label>
          <input
            id="userId"
            type="text"
            value={userId}
            onChange={(e) => handleUserIdChange(e.target.value)}
            placeholder="you@example.com"
            style={styles.input}
          />
        </div>

        {purchased ? (
          <div style={styles.purchasedBadge}>Purchased ✓</div>
        ) : (
          <button
            onClick={() => void handleBuy()}
            disabled={!canBuy}
            style={{ ...styles.button, ...(!canBuy ? styles.buttonDisabled : {}) }}
          >
            {buying ? 'Processing…' : 'Buy Now'}
          </button>
        )}

        {feedback && <p style={styles.feedback}>{feedback}</p>}
      </div>
    </div>
  );
}

function badgeColor(status: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    active: { background: '#22c55e', color: '#fff' },
    upcoming: { background: '#3b82f6', color: '#fff' },
    ended: { background: '#6b7280', color: '#fff' },
    sold_out: { background: '#ef4444', color: '#fff' },
  };
  return map[status] ?? {};
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f5f9',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  heading: {
    margin: '0 0 1.5rem',
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  statusBlock: {
    marginBottom: '1.5rem',
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  stock: {
    margin: '0.5rem 0 0',
    fontSize: '1rem',
    color: '#374151',
  },
  dateRow: {
    margin: '0.5rem 0 0',
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  loading: {
    color: '#9ca3af',
    marginBottom: '1.5rem',
  },
  inputGroup: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.4rem',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: '1rem',
    boxSizing: 'border-box',
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: '0.75rem',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonDisabled: {
    background: '#c7d2fe',
    cursor: 'not-allowed',
  },
  purchasedBadge: {
    width: '100%',
    padding: '0.75rem',
    background: '#dcfce7',
    color: '#15803d',
    border: '1px solid #86efac',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 600,
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  feedback: {
    marginTop: '1rem',
    padding: '0.65rem 0.9rem',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '0.9rem',
    color: '#374151',
  },
};