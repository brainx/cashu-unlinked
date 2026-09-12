import {useEffect, useRef, useState} from 'react';
import type {Verdict} from '../../../src/contracts.js';
import {buildCaseReceiptSvg} from '../../../src/case-receipt.js';
import type {InvestigationEvidence} from '../model';
import '../receipt.css';

export function CaseReceipt({evidence, verdict, guess}: {
  evidence: InvestigationEvidence; verdict: Verdict; guess: string;
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const active = useRef(true);
  const busy = useRef(false);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      for (const [url, timer] of downloads.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloads.current.clear();
    };
  }, []);

  async function save() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const svg = await buildCaseReceiptSvg(evidence, verdict, guess);
      if (!active.current) return;
      const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}));
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.current.delete(url);
      }, 30_000);
      downloads.current.set(url, timer);
      const link = document.createElement('a');
      link.href = url;
      link.download = `unlinked-case-${evidence.runId.slice(0, 8)}.svg`;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setStatus('Receipt download requested. The SVG opens as an image.');
    } catch {
      if (active.current) setError('Could not create this receipt. Try again.');
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  }

  return <section className="case-receipt" aria-label="Case receipt">
    <div className="eyebrow">YOUR CASE RECEIPT</div>
    <button className="receipt-save-button" disabled={saving} onClick={() => void save()}>
      <span>{saving ? 'Preparing receipt…' : 'Save case receipt'}</span><span aria-hidden="true">↧</span>
    </button>
    <p>Save your conclusion, compatible sources, and model limits as an SVG image.</p>
    <p className="receipt-status" role="status">{status}</p>
    {error && <p className="receipt-error" role="alert">{error}</p>}
  </section>;
}
