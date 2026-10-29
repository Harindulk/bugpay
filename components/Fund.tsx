"use client";
// Fund the bounty pool with PayPal Checkout. Real buttons when sandbox keys exist; a mock checkout otherwise.
import { useEffect, useRef, useState } from "react";
import { api, usd } from "./ui.tsx";

type PayPalNs = { Buttons: (o: unknown) => { render: (el: HTMLElement) => Promise<void>; close: () => void } };

let sdk: Promise<PayPalNs> | null = null; // one script tag per page, however often the dialog opens

function loadSdk(clientId: string): Promise<PayPalNs> {
  const w = window as unknown as { paypal?: PayPalNs };
  if (w.paypal) return Promise.resolve(w.paypal);
  return (sdk ??= new Promise<PayPalNs>((ok, fail) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    s.onload = () => ok(w.paypal!);
    s.onerror = () => { sdk = null; s.remove(); fail(new Error("PayPal SDK failed to load")); };
    document.head.appendChild(s);
  }));
}

export function Fund({ clientId, onDone }: { clientId: string | null; onDone: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState(100);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const order = () => api<{ id: string }>("/api/pool", { step: "order", amount }).then((o) => o.id);
  const capture = async (orderId: string) => {
    await api("/api/pool", { step: "capture", orderId, amount });
    dlg.current?.close();
    setOpen(false);
    onDone();
  };

  useEffect(() => {
    if (!open || !clientId || !box.current) return;
    let buttons: { close: () => void } | null = null;
    let dead = false; // the amount changed or the dialog closed while the SDK was loading
    box.current.innerHTML = "";
    loadSdk(clientId).then((pp) => {
      if (dead || !box.current) return;
      const b = pp.Buttons({
        style: { layout: "vertical", shape: "rect", label: "paypal", height: 40 },
        createOrder: order,
        onApprove: (d: { orderID: string }) => capture(d.orderID),
        onError: (e: Error) => setErr(e.message),
      });
      buttons = b;
      return b.render(box.current!);
    }).catch((e) => setErr(e.message));
    return () => { dead = true; buttons?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amount, clientId]);

  const mockPay = async () => {
    setBusy(true);
    setErr("");
    try { await capture(await order()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn" onClick={() => { setOpen(true); dlg.current?.showModal(); }}>Add funds</button>
      <dialog ref={dlg} onClose={() => setOpen(false)} aria-labelledby="fund-title">
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 id="fund-title">Add to the bounty pool</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>Paid once through PayPal Checkout. Testers are paid out of this pool.</p>
          </div>
          <div className="amounts" role="group" aria-label="Amount">
            {[50, 100, 250].map((a) => (
              <button key={a} className="btn" aria-pressed={amount === a} onClick={() => setAmount(a)}>{usd(a)}</button>
            ))}
          </div>
          {clientId ? <div ref={box} /> : (
            <button className="btn primary" onClick={mockPay} disabled={busy}>{busy ? "Capturing" : `Pay ${usd(amount)} with PayPal (mock)`}</button>
          )}
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
        </div>
      </dialog>
    </>
  );
}
